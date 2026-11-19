<template>
  <div class="modal-overlay" @click="emit('close')">
    <div class="modal-content quick-add-modal" @click.stop>
      <div class="modal-header">
        <h3>批量设置分组</h3>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 12px;">
          为已选的 <strong style="color: rgba(255,255,255,0.9);">{{ count }}</strong> 张卡片设置分组
        </p>
        <div class="form-group">
          <label>分组名称</label>
          <input
            :value="value"
            @input="emit('update:value', $event.target.value)"
            placeholder="输入分组名，留空则清除分组"
            class="batch-input"
            list="section-datalist"
            @keyup.enter="emit('apply')"
          />
        </div>
        <div class="batch-actions" style="margin-top: 16px;">
          <button @click="emit('close')" class="btn btn-cancel">取消</button>
          <button @click="emit('apply')" class="btn btn-primary" :disabled="loading">
            {{ loading ? '设置中...' : '应用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 0 },
  value: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['update:value', 'apply', 'close']);
</script>

<style scoped src="../styles/dialog-forms.css"></style>
