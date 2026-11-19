/**
 * Server-Sent Events 管理器
 * 用于向所有连接的客户端推送数据版本变更通知
 */

const MAX_TOTAL_CLIENTS = 100;
const MAX_CLIENTS_PER_IP = 3;

// 存储所有SSE连接
const clients = new Set();
const ipCounts = new Map();

function getClientIp(req) {
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || 'unknown';
}

/**
 * 带限额的客户端注册：总数 100，单 IP 3。
 * 超限返回 false，由调用方决定如何拒绝。
 */
function tryAddClient(req, res) {
  const ip = getClientIp(req);
  const current = ipCounts.get(ip) || 0;

  if (clients.size >= MAX_TOTAL_CLIENTS || current >= MAX_CLIENTS_PER_IP) {
    return false;
  }

  clients.add(res);
  ipCounts.set(ip, current + 1);

  res.on('close', () => {
    if (clients.delete(res)) {
      const remaining = (ipCounts.get(ip) || 1) - 1;
      if (remaining <= 0) {
        ipCounts.delete(ip);
      } else {
        ipCounts.set(ip, remaining);
      }
    }
  });

  return true;
}

function addClient(res) {
  clients.add(res);

  // 客户端断开时移除
  res.on('close', () => {
    clients.delete(res);
  });
}

/**
 * 向所有客户端广播数据版本变更
 * @param {number} version 新数据版本号
 * @param {string} clientId 发起变更的客户端ID (可选)
 * @param {Object} payload 附加数据 (可选，例如 { type: 'menu_updated' })
 */
function broadcastVersionChange(version, clientId = null, payload = null) {
  const messageData = { 
    type: 'version_change', 
    version,
    senderId: clientId
  };
  
  if (payload) {
    Object.assign(messageData, payload);
  }

  const message = JSON.stringify(messageData);
  const data = `data: ${message}\n\n`;
  
  clients.forEach(client => {
    try {
      client.write(data);
      // 确保数据立即发送，不被缓冲
      if (client.flush) client.flush();
    } catch (e) {
      // 写入失败，移除该客户端
      clients.delete(client);
    }
  });
}

module.exports = {
  addClient,
  tryAddClient,
  broadcastVersionChange
};
