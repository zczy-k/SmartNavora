const express = require('express');
const axios = require('axios');
const dns = require('dns').promises;
const db = require('../db');
const auth = require('./authMiddleware');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { detectDuplicates, getDuplicateMatch } = require('../utils/urlNormalizer');
const { autoGenerateForCards } = require('./ai');
const router = express.Router();

const INVALID_LINK_TIMEOUT_MS = 8000;
const INVALID_LINK_CONCURRENCY = 8;

function isPrivateHostname(hostname) {
  const value = (hostname || '').toLowerCase();
  if (!value) return true;
  if (value === 'localhost' || value.endsWith('.local')) return true;
  if (/^10\./.test(value) || /^127\./.test(value) || /^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^169\.254\./.test(value)) return true;
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  return false;
}

function normalizeDetectionError(error) {
  const code = error?.code || '';
  const message = error?.message || '';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return { reason: '连接超时', bucket: 'maybe_invalid', confidence: 'possible' };
  }
  if (code === 'ENOTFOUND') {
    return { reason: '域名解析失败', bucket: 'safe_to_delete', confidence: 'high' };
  }
  if (code === 'ECONNREFUSED') {
    return { reason: '连接被拒绝', bucket: 'maybe_invalid', confidence: 'possible' };
  }
  if (/certificate|ssl/i.test(message)) {
    return { reason: 'SSL 证书错误', bucket: 'maybe_invalid', confidence: 'possible' };
  }
  return { reason: message || '无法访问', bucket: 'maybe_invalid', confidence: 'possible' };
}

async function checkDnsStatus(hostname) {
  try {
    await dns.lookup(hostname);
    return { status: 'ok', reason: 'DNS 解析成功' };
  } catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_NONAME') {
      return { status: 'nxdomain', reason: '域名不存在' };
    }
    return { status: 'error', reason: 'DNS 检测失败' };
  }
}

async function requestUrl(url, method) {
  return axios({
    url,
    method,
    timeout: INVALID_LINK_TIMEOUT_MS,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    validateStatus: () => true
  });
}

function isAccessibleStatus(status) {
  return (status >= 200 && status < 400) || status === 401 || status === 403;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function shouldRetryForError(error) {
  const code = error?.code || '';
  return ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'].includes(code);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function detectInvalidCard(card) {
  let parsedUrl;
  try {
    parsedUrl = new URL(card.url);
  } catch (_error) {
    return {
      id: card.id,
      title: card.title,
      url: card.url,
      menuName: card.menu_name || '未分类',
      subMenuName: card.sub_menu_name || '',
      bucket: 'safe_to_delete',
      confidence: 'high',
      reason: '链接格式无效',
      detail: '无法解析为有效 URL',
      statusCode: null
    };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      id: card.id,
      title: card.title,
      url: card.url,
      menuName: card.menu_name || '未分类',
      subMenuName: card.sub_menu_name || '',
      bucket: 'skipped',
      confidence: 'skip',
      reason: '非 HTTP 链接',
      detail: parsedUrl.protocol,
      statusCode: null
    };
  }

  if (isPrivateHostname(parsedUrl.hostname)) {
    return {
      id: card.id,
      title: card.title,
      url: card.url,
      menuName: card.menu_name || '未分类',
      subMenuName: card.sub_menu_name || '',
      bucket: 'skipped',
      confidence: 'skip',
      reason: '内网或本地地址',
      detail: parsedUrl.hostname,
      statusCode: null
    };
  }

  try {
    let response = await requestUrl(card.url, 'head');
    if (!isAccessibleStatus(response.status)) {
      response = await requestUrl(card.url, 'get');
    }

    if (!isAccessibleStatus(response.status) && isRetryableStatus(response.status)) {
      await delay(600);
      response = await requestUrl(card.url, 'get');
    }

    if (isAccessibleStatus(response.status)) {
      return {
        id: card.id,
        title: card.title,
        url: card.url,
        menuName: card.menu_name || '未分类',
        subMenuName: card.sub_menu_name || '',
        bucket: 'valid',
        confidence: 'valid',
        reason: '访问正常',
        detail: `HTTP ${response.status}`,
        statusCode: response.status
      };
    }

    // 只有在 GET 复核后仍然返回 404/410，才归类为确定失效
    if (response.status === 404 || response.status === 410) {
      return {
        id: card.id,
        title: card.title,
        url: card.url,
        menuName: card.menu_name || '未分类',
        subMenuName: card.sub_menu_name || '',
        bucket: 'safe_to_delete',
        confidence: 'high',
        reason: response.status === 404 ? '页面不存在' : '页面已永久删除',
        detail: `HTTP ${response.status}`,
        statusCode: response.status
      };
    }

    const dnsStatus = await checkDnsStatus(parsedUrl.hostname);
    return {
      id: card.id,
      title: card.title,
      url: card.url,
      menuName: card.menu_name || '未分类',
      subMenuName: card.sub_menu_name || '',
      bucket: dnsStatus.status === 'nxdomain' ? 'safe_to_delete' : 'maybe_invalid',
      confidence: dnsStatus.status === 'nxdomain' ? 'high' : 'possible',
      reason: dnsStatus.status === 'nxdomain' ? '域名不存在' : `HTTP ${response.status}`,
      detail: dnsStatus.reason,
      statusCode: response.status
    };
  } catch (error) {
    if (shouldRetryForError(error)) {
      try {
        await delay(600);
        const retryResponse = await requestUrl(card.url, 'get');
        if (isAccessibleStatus(retryResponse.status)) {
          return {
            id: card.id,
            title: card.title,
            url: card.url,
            menuName: card.menu_name || '未分类',
            subMenuName: card.sub_menu_name || '',
            bucket: 'valid',
            confidence: 'valid',
            reason: '访问正常',
            detail: `重试后恢复，HTTP ${retryResponse.status}`,
            statusCode: retryResponse.status
          };
        }

        if (retryResponse.status === 404 || retryResponse.status === 410) {
          return {
            id: card.id,
            title: card.title,
            url: card.url,
            menuName: card.menu_name || '未分类',
            subMenuName: card.sub_menu_name || '',
            bucket: 'safe_to_delete',
            confidence: 'high',
            reason: retryResponse.status === 404 ? '页面不存在' : '页面已永久删除',
            detail: `重试后确认，HTTP ${retryResponse.status}`,
            statusCode: retryResponse.status
          };
        }
      } catch (_retryError) {
        // 重试后仍失败，则继续走保守归类
      }
    }

    const normalized = normalizeDetectionError(error);
    const dnsStatus = await checkDnsStatus(parsedUrl.hostname);
    const bucket = normalized.bucket === 'safe_to_delete' || dnsStatus.status === 'nxdomain'
      ? 'safe_to_delete'
      : 'maybe_invalid';
    const reason = dnsStatus.status === 'nxdomain' ? '域名不存在' : normalized.reason;
    const detail = dnsStatus.status === 'ok'
      ? `DNS 正常，${normalized.reason}`
      : dnsStatus.reason;

    return {
      id: card.id,
      title: card.title,
      url: card.url,
      menuName: card.menu_name || '未分类',
      subMenuName: card.sub_menu_name || '',
      bucket,
      confidence: bucket === 'safe_to_delete' ? 'high' : 'possible',
      reason,
      detail,
      statusCode: error?.response?.status || null
    };
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function buildInvalidLinkDetectionResult(cards) {
  const detectionResults = await mapWithConcurrency(cards, INVALID_LINK_CONCURRENCY, detectInvalidCard);
  const safeToDelete = detectionResults.filter(item => item.bucket === 'safe_to_delete');
  const maybeInvalid = detectionResults.filter(item => item.bucket === 'maybe_invalid');
  const skipped = detectionResults.filter(item => item.bucket === 'skipped');
  const validCount = detectionResults.filter(item => item.bucket === 'valid').length;

  return {
    scannedAt: new Date().toISOString(),
    total: cards.length,
    validCount,
    safeToDelete,
    maybeInvalid,
    skipped,
    summary: {
      safeToDelete: safeToDelete.length,
      maybeInvalid: maybeInvalid.length,
      skipped: skipped.length,
      valid: validCount
    }
  };
}

function loadCardsForInvalidLinkCheck(whereClause = '', params = []) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT c.id, c.title, c.url, c.menu_id, c.sub_menu_id, m.name AS menu_name, sm.name AS sub_menu_name
      FROM cards c
      LEFT JOIN menus m ON c.menu_id = m.id
      LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
      ${whereClause}
      ORDER BY c.id DESC
    `, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function deleteCardsByIds(cardIds, clientId) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      resolve({ success: true, deleted: 0, message: '未提供要删除的卡片' });
      return;
    }

    const placeholders = cardIds.map(() => '?').join(',');

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.run(`DELETE FROM card_tags WHERE card_id IN (${placeholders})`, cardIds, (tagErr) => {
          if (tagErr) {
            db.run('ROLLBACK');
            reject(new Error('删除标签关联失败: ' + tagErr.message));
            return;
          }

          db.run(`DELETE FROM cards WHERE id IN (${placeholders})`, cardIds, function(cardErr) {
            if (cardErr) {
              db.run('ROLLBACK');
              reject(new Error('删除卡片失败: ' + cardErr.message));
              return;
            }

            const deletedCount = this.changes;
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(new Error('提交事务失败: ' + commitErr.message));
                return;
              }

              triggerDebouncedBackup(clientId, { type: 'cards_updated' });
              resolve({
                success: true,
                deleted: deletedCount,
                message: `成功删除 ${deletedCount} 张卡片`
              });
            });
          });
        });
      });
    });
  });
}

// 获取所有卡片（按分类分组，用于首屏加载优化）
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  db.all(`
    SELECT c.*, sm.parent_id as parent_menu_id
    FROM cards c
    LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
    ORDER BY c.menu_id, c.sub_menu_id, c."order"
  `, [], (err, cards) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (cards.length === 0) {
      return res.json({ cards: [], cardsByCategory: {} });
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const cardsByCategory = {};
        cards.forEach(card => {
          const menuId = card.menu_id || card.parent_menu_id;
          const key = `${menuId}_${card.sub_menu_id || 'null'}`;
          if (!cardsByCategory[key]) {
            cardsByCategory[key] = [];
          }
          cardsByCategory[key].push({
            ...card,
            menu_id: menuId,
            tags: tagsByCard[card.id] || []
          });
        });
        
        res.json({ cardsByCategory });
      }
    );
  });
});

// 获取指定菜单的卡片（包含标签）
router.get('/:menuId', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  const { subMenuId } = req.query;
  const menuId = req.params.menuId;
  let query, params;
  
  if (subMenuId) {
    query = `
      SELECT c.*, sm.parent_id as parent_menu_id
      FROM cards c
      LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
      WHERE c.sub_menu_id = ?
      ORDER BY c."order"
    `;
    params = [subMenuId];
  } else {
    query = 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
    params = [menuId];
  }
  
  db.all(query, params, (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    if (cards.length === 0) {
      return res.json([]);
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({error: err.message});
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const result = cards.map(card => ({
          ...card,
          menu_id: card.menu_id || card.parent_menu_id || parseInt(menuId),
          tags: tagsByCard[card.id] || []
        }));
        
        res.json(result);
      }
    );
  });
});

// 批量更新卡片（用于拖拽排序和分类）- 必须放在/:id之前
router.patch('/batch-update', auth, (req, res) => {
  const { cards } = req.body;
  const clientId = req.headers['x-client-id'];
  
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  // 使用Promise优化批量更新
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      let completed = 0;
      let hasError = false;
      
      if (cards.length === 0) {
        db.run('COMMIT');
        return res.json({ success: true, updated: 0 });
      }
      
      cards.forEach((card) => {
        const { id, order, menu_id, sub_menu_id } = card;
        
        db.run(
          'UPDATE cards SET "order"=?, menu_id=?, sub_menu_id=? WHERE id=?',
          [order, menu_id, sub_menu_id || null, id],
          function(err) {
            if (hasError) return; // 已经处理过错误
            
            if (err) {
              hasError = true;
              db.run('ROLLBACK', () => {
                res.status(500).json({ error: err.message });
              });
              return;
            }
            
            completed++;
            
            if (completed === cards.length) {
              db.run('COMMIT', (err) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                triggerDebouncedBackup(clientId, { type: 'cards_updated' }); // 触发自动备份和SSE广播
                res.json({ success: true, updated: completed });
              });
            }
          }
        );
      });
    });
  });
});

// 新增卡片（含标签）
router.post('/', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  const clientId = req.headers['x-client-id'];
  
  // 先检查是否重复
  db.all('SELECT * FROM cards', [], (err, existingCards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const newCard = { title, url };
    const duplicate = existingCards.find(card => {
      const match = getDuplicateMatch(newCard, card);
      return match && match.type === 'exact';
    });
    
    if (duplicate) {
      return res.status(409).json({
        error: '卡片已存在',
        message: `该卡片与现有卡片“${duplicate.title}”重复`,
        duplicate: duplicate
      });
    }
    
    // 不重复，添加卡片
    db.run(
      'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0],
      function(err) {
        if (err) return res.status(500).json({error: err.message});
        
        const cardId = this.lastID;
        
        // 如果有标签，关联标签
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${cardId}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            triggerDebouncedBackup(clientId, { type: 'cards_updated' });
            
            // 异步触发 AI 自动生成（不阻塞响应）
            setImmediate(() => autoGenerateForCards([cardId]));
            
            res.json({ id: cardId });
          });
        } else {
          triggerDebouncedBackup(clientId, { type: 'cards_updated' });
          
          // 异步触发 AI 自动生成（不阻塞响应）
          setImmediate(() => autoGenerateForCards([cardId]));
          
          res.json({ id: cardId });
        }
      }
    );
  });
});

// 更新卡片（含标签）
router.put('/:id', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  const { id } = req.params;
  const clientId = req.headers['x-client-id'];
  
  db.run(
    'UPDATE cards SET menu_id=?, sub_menu_id=?, title=?, url=?, logo_url=?, desc=?, "order"=? WHERE id=?', 
    [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0, id],
    function(err) {
      if (err) return res.status(500).json({error: err.message});
      
      const changes = this.changes;
      
      // 如果没有更新任何行，说明卡片不存在
      if (changes === 0) {
        return res.status(404).json({error: '卡片不存在'});
      }
      
      // 删除旧的标签关联
      db.run('DELETE FROM card_tags WHERE card_id=?', [id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        
        // 处理标签关联的函数
        const finishUpdate = () => {
          // 查询更新后的卡片数据返回给前端
          db.get('SELECT * FROM cards WHERE id=?', [id], (err, card) => {
            if (err) return res.status(500).json({error: err.message});
            if (!card) return res.status(404).json({error: '卡片不存在'});
            
            triggerDebouncedBackup(clientId, { type: 'cards_updated' }); // 触发自动备份和SSE广播
            res.json({ 
              success: true,
              changed: changes,
              card: card
            });
          });
        };
        
        // 如果有新标签，添加关联
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${id}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            finishUpdate();
          });
        } else {
          finishUpdate();
        }
      });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  const cardId = req.params.id;
  const clientId = req.headers['x-client-id'];
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 先删除关联的标签
      db.run('DELETE FROM card_tags WHERE card_id=?', [cardId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除标签关联失败: ' + err.message });
        }
        
        // 再删除卡片
        db.run('DELETE FROM cards WHERE id=?', [cardId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCount = this.changes;
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: '提交事务失败: ' + err.message });
            }
            
            triggerDebouncedBackup(clientId, { type: 'cards_updated' }); // 触发自动备份和SSE广播
            res.json({ 
              success: true,
              deleted: deletedCount
            });
          });
        });
      });
    });
  });
});

router.get('/invalid-links/check/all', auth, async (req, res) => {
  try {
    const cards = await loadCardsForInvalidLinkCheck();
    res.json(await buildInvalidLinkDetectionResult(cards));
  } catch (error) {
    res.status(500).json({ error: error.message || '检测失效链接失败' });
  }
});

router.post('/invalid-links/recheck', auth, async (req, res) => {
  const { cardIds } = req.body;

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(400).json({ error: '请选择要重新检测的卡片' });
  }

  try {
    const placeholders = cardIds.map(() => '?').join(',');
    const cards = await loadCardsForInvalidLinkCheck(`WHERE c.id IN (${placeholders})`, cardIds);
    res.json(await buildInvalidLinkDetectionResult(cards));
  } catch (error) {
    res.status(500).json({ error: error.message || '重新检测失败' });
  }
});

// 检测重复卡片
router.get('/detect-duplicates/all', auth, (req, res) => {
  db.all('SELECT * FROM cards ORDER BY id', [], (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const duplicateGroups = detectDuplicates(cards);
    
    res.json({
      total: cards.length,
      duplicateGroups: duplicateGroups,
      duplicateCount: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0)
    });
  });
});

// 记录卡片点击（用于频率排序）
router.post('/:id/click', (req, res) => {
  const cardId = req.params.id;
  
  db.run(
    'UPDATE cards SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ?',
    [cardId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '卡片不存在' });
      res.json({ success: true });
    }
  );
});

// 批量删除重复卡片
router.post('/remove-duplicates', auth, (req, res) => {
  const { cardIds } = req.body;
  const clientId = req.headers['x-client-id'];

  deleteCardsByIds(cardIds, clientId)
    .then(result => res.json(result))
    .catch(error => res.status(500).json({ error: error.message || '删除失败' }));
});

router.post('/remove-many', auth, (req, res) => {
  const { cardIds } = req.body;
  const clientId = req.headers['x-client-id'];

  deleteCardsByIds(cardIds, clientId)
    .then(result => res.json(result))
    .catch(error => res.status(500).json({ error: error.message || '删除失败' }));
});

router.get('/user-settings/sort', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['user_sort_type'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sortType: row?.value || 'default' });
  });
});

router.post('/user-settings/sort', (req, res) => {
  const { sortType } = req.body;
  if (!sortType) {
    return res.status(400).json({ error: '排序类型不能为空' });
  }
  
  db.run(
    'REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['user_sort_type', sortType],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
