<template>
  <teleport to="body">
    <transition-group name="app-toast" tag="div" class="app-toast-stack">
      <div
        v-for="item in state.items"
        :key="item.id"
        class="app-toast"
        :class="item.type"
        role="status"
        @click="dismissToast(item.id)"
      >
        <span class="app-toast-icon">
          <svg v-if="item.type === 'loading'" class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <svg v-else-if="item.type === 'error'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <svg v-else-if="item.type === 'info'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </span>
        <span class="app-toast-text">{{ item.text }}</span>
      </div>
    </transition-group>
  </teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast';
const { state, dismissToast } = useToast();
</script>

<style scoped>
.app-toast-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.app-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 220px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 10px;
  background: #fff;
  color: #1f2937;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.16);
  border: 1px solid #e5e9f2;
  cursor: pointer;
  word-break: break-word;
}
.app-toast-icon {
  display: inline-flex;
  flex-shrink: 0;
  margin-top: 1px;
}
.app-toast.success { border-color: #b7e4c7; }
.app-toast.success .app-toast-icon { color: #16a34a; }
.app-toast.error { border-color: #f5c2c7; }
.app-toast.error .app-toast-icon { color: #dc2626; }
.app-toast.info { border-color: #bcd6f7; }
.app-toast.info .app-toast-icon { color: #2563eb; }
.app-toast.loading .app-toast-icon { color: #2566d8; }
.spin { animation: app-toast-spin 1s linear infinite; }
@keyframes app-toast-spin {
  to { transform: rotate(360deg); }
}
.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
