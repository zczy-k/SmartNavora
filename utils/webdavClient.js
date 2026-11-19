const fs = require('fs');
const path = require('path');
const { createClient } = require('webdav');
const { decryptWebDAVConfig } = require('./crypto');

function getConfigPath() {
  return path.join(__dirname, '..', 'config', '.webdav-config.json');
}

function readEncryptedConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function readConfig() {
  try {
    const encrypted = readEncryptedConfig();
    if (!encrypted) return null;
    return decryptWebDAVConfig(encrypted);
  } catch (e) {
    return null;
  }
}

function createClientWithIPv4(url, username, password, extraOptions) {
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch (e) {
    // URL 含非法转义时保留原值，行为与旧实现一致
  }
  const { getForcedIPv4Agents } = require('./ipv4');
  const { httpsAgent } = getForcedIPv4Agents();
  return createClient(decodedUrl, {
    username,
    password,
    httpsAgent,
    ...(extraOptions || {})
  });
}

// 读取已保存的加密配置并创建客户端；未配置/解密失败返回 null
async function getClient() {
  const config = readConfig();
  if (!config) return null;
  return createClientWithIPv4(config.url, config.username, config.password);
}

module.exports = {
  getConfigPath,
  readEncryptedConfig,
  readConfig,
  createClientWithIPv4,
  getClient
};
