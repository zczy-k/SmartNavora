<template>
  <div class="modal-overlay" @click="emit('close')">
    <div class="modal-content quick-add-modal" @click.stop>
      <div class="modal-header">
        <h3>添加卡片</h3>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>网址 <span style="color: #ef4444;">*</span></label>
          <input v-model="form.url" placeholder="https://example.com" class="batch-input" @keyup.enter="emit('save')" />
        </div>
        <div class="form-group">
          <label>标题</label>
          <input v-model="form.title" placeholder="留空则自动获取" class="batch-input" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea v-model="form.desc" placeholder="留空则 AI 自动生成" class="batch-textarea" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label>分组 <span class="field-hint">（可选，用于在子菜单内分类）</span></label>
          <input v-model="form.section" placeholder="例如：AI 工具、开发环境" class="batch-input" list="section-datalist" />
        </div>
        <p v-if="error" class="batch-error">{{ error }}</p>
        <div class="batch-actions" style="margin-top: 16px;">
          <button @click="emit('close')" class="btn btn-cancel">取消</button>
          <button @click="emit('save')" class="btn btn-primary" :disabled="loading">
            {{ loading ? '添加中...' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  form: { type: Object, required: true },
  error: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['save', 'close']);
</script>

<style scoped src="../styles/dialog-forms.css"></style>
