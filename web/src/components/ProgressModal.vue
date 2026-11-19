<template>
  <div class="progress-modal-overlay">
    <div class="progress-modal">
      <div class="progress-header">
        <span class="progress-icon" :class="status">
          <svg v-if="status === 'loading'" class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <svg v-else-if="status === 'success'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <svg v-else-if="status === 'error'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </span>
        <span class="progress-title">{{ title }}</span>
      </div>
      <div class="progress-message">{{ message }}</div>
      <button v-if="status !== 'loading'" @click="emit('close')" class="progress-close-btn">
        确定
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  status: { type: String, default: 'loading' },
  title: { type: String, default: '' },
  message: { type: String, default: '' }
});
const emit = defineEmits(['close']);
</script>

<style scoped>
.progress-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(4px);
}

.progress-modal {
  background: white;
  border-radius: 12px;
  padding: 24px 32px;
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.progress-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-icon.loading svg {
  color: #1890ff;
}

.progress-icon .spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.progress-message {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
  line-height: 1.5;
}

.progress-close-btn {
  background: #1890ff;
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.progress-close-btn:hover {
  background: #40a9ff;
}
</style>
