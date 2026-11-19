<template>
  <div v-if="show" class="modal-overlay" @click="emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>友情链接</h3>
        <button @click="emit('close')" class="close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="friend-links-grid">
          <a
            v-for="friend in friends"
            :key="friend.id"
            :href="friend.url"
            target="_blank"
            class="friend-link-card"
          >
            <div class="friend-link-logo">
              <img
                :src="getFriendLogo(friend)"
                :alt="friend.title"
                loading="lazy"
                @error="handleFriendLogoError"
              />
            </div>
            <div class="friend-link-info">
              <h4>{{ friend.title }}</h4>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  friends: { type: Array, default: () => [] }
});
const emit = defineEmits(['close']);

function getFriendLogo(friend) {
  if (friend.logo) return friend.logo;
  if (friend.url) {
    try {
      return `/icons/${new URL(friend.url).hostname}`;
    } catch {
      // 地址无法解析时走默认图
    }
  }
  return '/default-favicon.png';
}

function handleFriendLogoError(e) {
  e.target.src = '/default-favicon.png';
}
</script>

<style scoped>
@media (max-width: 768px) {
  .modal-content {
    width: 88vw;
    height: auto;
    max-height: 70vh;
    border-radius: 14px;
  }

  .modal-content.menu-modal {
    width: 85vw;
    max-width: 320px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-header h3 {
    font-size: 16px;
  }

  .modal-body {
    padding: 16px 14px;
  }
}

@media (max-width: 480px) {
  .modal-content {
    width: 90vw;
    max-height: 65vh;
    border-radius: 12px;
  }

  .modal-header {
    padding: 10px 14px;
  }

  .modal-header h3 {
    font-size: 15px;
  }

  .modal-body {
    padding: 14px 12px;
  }
}

.friend-links-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .friend-links-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.friend-link-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  text-decoration: none;
  color: inherit;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.friend-link-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  background: #ffffff;
  border-color: rgba(24, 144, 255, 0.2);
}

.friend-link-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.friend-link-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.friend-link-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 18px;
  font-weight: 600;
  border-radius: 8px;
}

.friend-link-info h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  line-height: 1.3;
  word-break: break-all;
}

/* ========== 全局模态框样式 ========== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.modal-content {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-content.menu-modal {
  max-width: 360px;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  color: white;
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

@media (max-width: 1024px) and (min-width: 769px) {
  .modal-content {
    max-width: 520px;
    max-height: 80vh;
  }
}
</style>
