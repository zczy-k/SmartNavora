import { ref, onMounted, onUnmounted } from 'vue';
import { getClientId } from '../api';

// 与 Home.vue 共用同一个版本键，保证首页与后台的版本认知一致
const DATA_VERSION_KEY = 'nav_data_version';

const sseConnection = ref(null);
const isConnected = ref(false);
const currentVersion = ref(parseInt(localStorage.getItem(DATA_VERSION_KEY) || '0'));
const listeners = new Map();

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
let reconnectTimer = null;

function readStoredVersion() {
  return parseInt(localStorage.getItem(DATA_VERSION_KEY) || '0');
}

function saveStoredVersion(version) {
  currentVersion.value = version;
  try {
    localStorage.setItem(DATA_VERSION_KEY, String(version));
  } catch (e) {
    // 存储不可用时忽略
  }
}

function dispatch(payload) {
  listeners.forEach((callback, key) => {
    try {
      callback(payload);
    } catch (e) {
      console.error('SSE listener error:', key, e);
    }
  });
}

function scheduleReconnect() {
  if (document.visibilityState === 'hidden') return;
  reconnectAttempts++;
  const delay = Math.min(3000 * reconnectAttempts, MAX_RECONNECT_DELAY);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (sseConnection.value || document.visibilityState === 'hidden') {
    return;
  }

  const clientId = getClientId();
  const eventSource = new EventSource(`/api/sse/data-sync?clientId=${clientId}`);

  eventSource.onopen = () => {
    isConnected.value = true;
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'connected') {
        const stored = readStoredVersion();
        // 连上即对账：本地有旧版本且与服务端不一致时，触发一次刷新（断线期间数据可能已变）
        if (stored > 0 && data.version !== stored) {
          saveStoredVersion(data.version);
          dispatch({ version: data.version, isSelfChange: false, payload: data });
        } else {
          saveStoredVersion(data.version);
        }
        return;
      }

      if (data.type === 'version_change') {
        saveStoredVersion(data.version);
        dispatch({
          version: data.version,
          isSelfChange: data.senderId === clientId,
          payload: data
        });
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    isConnected.value = false;
    eventSource.close();
    sseConnection.value = null;
    scheduleReconnect();
  };

  sseConnection.value = eventSource;
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sseConnection.value) {
    sseConnection.value.close();
    sseConnection.value = null;
    isConnected.value = false;
  }
}

function subscribe(key, callback) {
  listeners.set(key, callback);

  if (!sseConnection.value) {
    connect();
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    connect();
  } else {
    disconnect();
  }
}

function unsubscribe(key) {
  listeners.delete(key);

  if (listeners.size === 0) {
    disconnect();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}

export function useDataSync(componentKey, onDataChange) {
  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (onDataChange) {
      subscribe(componentKey, onDataChange);
    }
  });

  onUnmounted(() => {
    unsubscribe(componentKey);
  });

  return {
    isConnected,
    currentVersion,
    subscribe,
    unsubscribe
  };
}

export function useDataSyncManual() {
  return {
    isConnected,
    currentVersion,
    subscribe,
    unsubscribe,
    connect,
    disconnect
  };
}
