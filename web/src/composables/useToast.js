import { reactive } from 'vue';

const state = reactive({ items: [] });
const MAX_ITEMS = 4;
let seq = 0;

export function dismissToast(id) {
  const idx = state.items.findIndex(item => item.id === id);
  if (idx >= 0) state.items.splice(idx, 1);
}

export function toast(text, type = 'success', duration = 3000) {
  if (!text) return null;
  const id = ++seq;
  state.items.push({ id, text: String(text), type });
  if (type !== 'loading' && duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  if (state.items.length > MAX_ITEMS) {
    state.items.splice(0, state.items.length - MAX_ITEMS);
  }
  return id;
}

// 进行中式提示（loading）转终态：同一 toast 原地更新，不叠加
export function updateToast(id, text, type = 'success', duration = 3000) {
  if (id == null) return toast(text, type, duration);
  const item = state.items.find(entry => entry.id === id);
  if (!item) return toast(text, type, duration);
  item.text = String(text);
  item.type = type;
  if (type !== 'loading' && duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function useToast() {
  return { state, toast, updateToast, dismissToast };
}
