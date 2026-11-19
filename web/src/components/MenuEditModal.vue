<template>
  <div class="modal-overlay">
    <div class="modal-content menu-modal" @click.stop>
      <div class="modal-header">
        <h3>{{ mode === 'add' ? '添加' : '编辑' }}{{ type === 'menu' ? '菜单' : '子菜单' }}</h3>
        <button @click="emit('close')" class="close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>名称</label>
          <input
            v-model="data.name"
            type="text"
            :placeholder="type === 'menu' ? '请输入菜单名称' : '请输入子菜单名称'"
            class="batch-input"
            @keyup.enter="emit('save')"
            maxlength="20"
          />
        </div>
        <div v-if="mode === 'add'" class="menu-insert-hint">{{ hint }}</div>
        <div class="batch-actions" style="margin-top: 20px;">
          <button @click="emit('close')" class="btn btn-cancel">取消</button>
          <button @click="emit('save')" class="btn btn-primary" :disabled="loading">
            {{ loading ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  mode: { type: String, default: 'add' },
  type: { type: String, default: 'menu' },
  data: { type: Object, required: true },
  hint: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['save', 'close']);
</script>

<style scoped src="../styles/dialog-forms.css"></style>
