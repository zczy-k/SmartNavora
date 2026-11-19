<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content" @click.stop style="max-width: 420px;">
      <div class="modal-header">
        <h3>同步云备份</h3>
        <button @click="emit('close')" class="close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 15px; color: #666;">本地数据版本比云端更新，请验证管理员密码后同步备份到云端。</p>
        <div class="password-input-wrapper">
          <input
            :value="password"
            @input="emit('update:password', $event.target.value)"
            type="password"
            placeholder="请输入管理员密码"
            class="batch-input password-input"
            @keyup.enter="emit('sync')"
          />
        </div>
        <p v-if="error" class="batch-error">{{ error }}</p>
        <p v-if="success" class="batch-success">{{ success }}</p>
        <div class="batch-actions" style="margin-top: 20px;">
          <button @click="emit('close')" class="btn btn-cancel">取消</button>
          <button @click="emit('sync')" class="btn btn-primary" :disabled="loading || !password">
            {{ loading ? '同步中...' : '同步备份到云端' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  password: { type: String, default: '' },
  error: { type: String, default: '' },
  success: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['update:password', 'sync', 'close']);
</script>

<style scoped src="../styles/dialog-forms.css"></style>
