import axios from 'axios';
const BASE = '/api';

// 生成并持久化客户端唯一标识，用于SSE同步优化
const CLIENT_ID_KEY = 'nav_client_id';
let clientId = localStorage.getItem(CLIENT_ID_KEY);
if (!clientId) {
  clientId = 'client_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  localStorage.setItem(CLIENT_ID_KEY, clientId);
}

export const getClientId = () => clientId;

// 默认头信息
function authHeaders() {
  const token = localStorage.getItem('token');
  const headers = {
    'X-Client-Id': clientId
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// 创建 axios 实例
export const instance = axios.create({
  baseURL: BASE
});

// 添加请求拦截器，自动添加 clientId 和 Authorization
instance.interceptors.request.use(config => {
  const headers = authHeaders();
  config.headers = { ...config.headers, ...headers };
  return config;
});

// ========== 全局 401 响应拦截器 ==========
let authChallengeHandler = null;
let authChallengePromise = null;

// 注册认证挑战回调（由 Home.vue 调用）
export const setAuthChallengeHandler = (handler) => {
  authChallengeHandler = handler;
};

// 尝试用保存的密码静默续签 token
async function tryRestoreTokenSilently() {
  const savedData = localStorage.getItem('nav_password_token');
  if (!savedData) return false;
  try {
    const parsed = JSON.parse(savedData);
    if (!parsed?.password) return false;
    const res = await instance.post('/verify-password', { password: parsed.password });
    localStorage.setItem('token', res.data.token);
    return true;
  } catch {
    localStorage.removeItem('nav_password_token');
    return false;
  }
}

// 响应拦截器：捕获 401，自动重试
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 非 401 或已重试过的请求，直接抛出
    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    // 第一步：尝试用保存的密码静默续签
    if (await tryRestoreTokenSilently()) {
      originalRequest.headers['Authorization'] = `Bearer ${localStorage.getItem('token')}`;
      return instance(originalRequest);
    }

    // 第二步：静默续签失败，弹出密码验证窗口
    // 如果已有弹窗在显示（并发请求场景），复用同一个 Promise
    if (!authChallengePromise && authChallengeHandler) {
      authChallengePromise = authChallengeHandler();
    }

    if (authChallengePromise) {
      try {
        await authChallengePromise;
        authChallengePromise = null;
        // 用户验证成功，用新 token 重试原请求
        originalRequest.headers['Authorization'] = `Bearer ${localStorage.getItem('token')}`;
        return instance(originalRequest);
      } catch {
        authChallengePromise = null;
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export const login = (username, password) => instance.post(`/login`, { username, password });
export const verifyPassword = (password) => instance.post(`/verify-password`, { password });
export const verifyToken = () => instance.get(`/verify-token`);

// 菜单相关API
export const getMenus = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return instance.get(`/menus`, { params });
};
export const addMenu = (data) => instance.post(`/menus`, data);
export const updateMenu = (id, data) => instance.put(`/menus/${id}`, data);
export const deleteMenu = (id) => instance.delete(`/menus/${id}`);

// 子菜单相关API
export const getSubMenus = (menuId) => instance.get(`/menus/${menuId}/submenus`);
export const addSubMenu = (menuId, data) => instance.post(`/menus/${menuId}/submenus`, data);
export const updateSubMenu = (id, data) => instance.put(`/menus/submenus/${id}`, data);
export const deleteSubMenu = (id) => instance.delete(`/menus/submenus/${id}`);

// 卡片相关API
export const getCards = (menuId, subMenuId = null, noCache = false) => {
  const params = subMenuId ? { subMenuId } : {};
  if (noCache) params._t = Date.now(); // 添加时间戳绕过浏览器缓存
  return instance.get(`/cards/${menuId}`, { params });
};
// 获取已有分组名称（用于自动补全）
export const getCardSections = (subMenuId) => {
  const params = subMenuId ? { sub_menu_id: subMenuId } : {};
  return instance.get('/cards/sections', { params });
};
// 批量获取所有卡片（按分类分组）
export const getAllCards = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return instance.get(`/cards`, { params });
};
export const addCard = (data) => instance.post(`/cards`, data);
export const updateCard = (id, data) => instance.put(`/cards/${id}`, data);
export const deleteCard = (id) => instance.delete(`/cards/${id}`);
export const batchUpdateCards = (cards) => instance.patch(`/cards/batch-update`, { cards });

export const uploadLogo = (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  return instance.post(`/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// 宣传API
export const getPromos = () => instance.get(`/promos`);
export const addPromo = (data) => instance.post(`/promos`, data);
export const updatePromo = (id, data) => instance.put(`/promos/${id}`, data);
export const deletePromo = (id) => instance.delete(`/promos/${id}`);

// 友链API
export const getFriends = () => instance.get(`/friends`);
export const addFriend = (data) => instance.post(`/friends`, data);
export const updateFriend = (id, data) => instance.put(`/friends/${id}`, data);
export const deleteFriend = (id) => instance.delete(`/friends/${id}`);

// 用户API
export const getUserProfile = () => instance.get(`/users/profile`);
export const changeUsername = (newUsername) => instance.put(`/users/username`, { newUsername });
export const changePassword = (oldPassword, newPassword) => instance.put(`/users/password`, { oldPassword, newPassword });
export const getUsers = () => instance.get(`/users`);

// 批量添加API
export const batchParseUrls = (urls) => instance.post(`/batch/parse`, { urls });
export const batchAddCards = (menuId, subMenuId, cards) => instance.post(`/batch/add`, { menu_id: menuId, sub_menu_id: subMenuId, cards });
export const batchCheckUrls = (urls) => instance.post(`/batch/check-urls`, { urls });

// 搜索引擎API
export const getSearchEngines = () => instance.get(`/search-engines`);
export const parseSearchEngine = (url) => instance.post(`/search-engines/parse`, { url });
export const addSearchEngine = (data) => instance.post(`/search-engines`, data);
export const updateSearchEngine = (id, data) => instance.put(`/search-engines/${id}`, data);
export const deleteSearchEngine = (id) => instance.delete(`/search-engines/${id}`);
export const reorderSearchEngines = (engines) => instance.post(`/search-engines/reorder`, { engines });

// 卡片去重API
export const detectDuplicates = () => instance.get(`/cards/detect-duplicates/all?_t=${Date.now()}`);
export const removeDuplicates = (cardIds) => instance.post(`/cards/remove-duplicates`, { cardIds });
export const removeManyCards = (cardIds) => instance.post(`/cards/remove-many`, { cardIds });
export const checkWebdavVersion = () => instance.get(`/backup/webdav/version-check?_t=${Date.now()}`);

// 备份API
export const createBackup = (name, description) => instance.post(`/backup/create`, { name, description });
export const getBackupList = () => instance.get(`/backup/list`);
export const downloadBackup = (filename) => {
  const token = localStorage.getItem('token');
  return `${BASE}/backup/download/${filename}?token=${token}`;
};
export const deleteBackup = (filename) => instance.delete(`/backup/delete/${filename}`);
export const renameBackup = (filename, newName) => instance.put(`/backup/rename/${filename}`, { newName });
export const uploadBackup = (file) => {
  const formData = new FormData();
  formData.append('backup', file);
  return instance.post(`/backup/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const restoreBackup = (filename) => instance.post(`/backup/restore/${filename}`);

// 数据版本号API（用于缓存同步）
export const getDataVersion = () => instance.get(`/data-version`);

// AI 批量生成 API
export const aiGetStatus = () => instance.get(`/ai/status`);
export const aiGetConfig = (provider = null) => {
  const params = provider ? { provider } : {};
  return instance.get(`/ai/config`, { params });
};
export const aiUpdateConfig = (data) => instance.post(`/ai/config`, data);
export const aiClearConfig = () => instance.delete(`/ai/config`);
export const aiTestConnection = (config = {}) => instance.post(`/ai/test`, config);
export const aiGetStats = () => instance.get(`/ai/stats`);
export const aiFilterCards = (filters) => instance.post(`/ai/filter-cards`, filters);
export const aiPreview = (data) => instance.post(`/ai/preview`, data);
export const aiStartBatchTask = (data) => instance.post(`/ai/batch-task/start`, data);
export const aiGetTaskStatus = () => instance.get(`/ai/batch-task/status`);
export const aiStopTask = () => instance.post(`/ai/batch-task/stop`, {});
