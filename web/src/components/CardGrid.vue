<template>
    <div ref="cardGridRef" class="container card-grid" :class="{ 'selection-mode': selectionMode }">
      <div v-for="card in cards" :key="card.id"
           class="link-item"
           :class="{
             'selected': isCardSelected(card)
           }"
           :data-card-id="card.id"
           draggable="false"
           @contextmenu.prevent="handleContextMenu($event, card)"
           @click="handleCardClick($event, card)"
           @mouseenter="hoveredCardId = card.id"
           @mouseleave="hoveredCardId = null">
          <a :href="selectionMode ? 'javascript:void(0)' : card.url"
             :target="selectionMode ? '' : '_blank'"
             draggable="false"
             @click="handleLinkClick($event, card)"
             @contextmenu.prevent
             class="card-link">
            <span class="icon-box" :data-letter="letterOf(card)" :style="{ '--icon-hue': hueOf(card) }">
              <img
                v-if="iconSrc(card)"
                class="link-icon"
                :src="iconSrc(card)"
                :data-chain-idx="0"
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                @load="onIconLoad"
                @error="onIconError($event, card)"
                @contextmenu.prevent>
            </span>
            <span class="link-text" @contextmenu.prevent>{{ truncate(card.title) }}</span>
          </a>
        <div v-if="isCardSelected(card)" class="card-selected-badge">✓</div>
        <div v-if="hoveredCardId === card.id && !selectionMode && (card.desc || card.menu_name)" class="card-tooltip">
          <div class="tooltip-content">
            <div v-if="card.desc" class="tooltip-desc">{{ card.desc }}</div>
            <div v-if="showSource && card.menu_name" class="tooltip-source">{{ card.sub_menu_name ? card.menu_name + ' › ' + card.sub_menu_name : card.menu_name }}</div>
          </div>
        </div>
      </div>
    
    <Teleport to="body">
      <div v-if="contextMenuVisible" 
           ref="contextMenuRef"
           class="context-menu"
           :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
           @click.stop>
        <div class="context-menu-item" @click="$emit('quickAdd')">
          <span class="context-menu-icon">➕</span>
          <span>添加卡片</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextEdit">
          <span class="context-menu-icon">✏️</span>
          <span>编辑</span>
        </div>
        <div class="context-menu-item" @click="onContextDelete">
          <span class="context-menu-icon">🗑️</span>
          <span>删除</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextSelect">
          <span class="context-menu-icon">☑️</span>
          <span>{{ isCardSelected(contextMenuCard) ? '取消选中' : '选中' }}</span>
        </div>
        <div class="context-menu-item" @click="onContextMove">
          <span class="context-menu-icon">📁</span>
          <span>移动到...</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" :class="{ disabled: !manualSortEnabled }" :title="manualSortEnabled ? '' : '请先在排序菜单切回「默认」再手动排序'" @click="onContextMoveUp">
          <span class="context-menu-icon">⬆️</span>
          <span>上移</span>
        </div>
        <div class="context-menu-item" :class="{ disabled: !manualSortEnabled }" :title="manualSortEnabled ? '' : '请先在排序菜单切回「默认」再手动排序'" @click="onContextMoveDown">
          <span class="context-menu-icon">⬇️</span>
          <span>下移</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextOpen">
          <span class="context-menu-icon">🔗</span>
          <span>在新标签页打开</span>
        </div>
        <div class="context-menu-item" @click="onContextCopyUrl">
          <span class="context-menu-icon">📋</span>
          <span>复制链接</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps({
  cards: Array,
  selectedCards: Array,
  categoryId: Number,
  subCategoryId: [Number, null],
  selectionMode: Boolean,
  showSource: Boolean,
  manualSortEnabled: { type: Boolean, default: true }
});

const emit = defineEmits([
  'contextEdit',
  'contextDelete',
  'toggleCardSelection',
  'openMovePanel',
  'requireAuth',
  'cardClicked',
  'quickAdd',
  'moveCard'
]);

const cardGridRef = ref(null);

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  } catch {
    return '';
  }
}

function iconSrc(card) {
  const custom = String(card.logo_url || '').trim();
  if (custom) return custom;
  const host = hostOf(card.url);
  return host ? `/icons/${host}` : '';
}

function iconChain(card) {
  const custom = String(card.logo_url || '').trim();
  const host = hostOf(card.url);
  const chain = [];
  if (custom) chain.push(custom);
  if (host) {
    chain.push(`/icons/${host}`);
  }
  return chain;
}

function letterOf(card) {
  const source = String(card.title || '').trim() || hostOf(card.url) || '?';
  return [...source][0].toUpperCase();
}

function hueOf(card) {
  const key = hostOf(card.url) || String(card.title || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function onIconLoad(event) {
  const el = event.target;
  el.classList.add('icon-loaded');
  el.classList.remove('icon-failed');
}

function onIconError(event, card) {
  const el = event.target;
  const chain = iconChain(card);
  const idx = Number(el.dataset.chainIdx || 0);
  const next = idx + 1;

  if (next < chain.length) {
    el.dataset.chainIdx = String(next);
    el.src = chain[next];
    return;
  }

  el.classList.remove('icon-loaded');
  el.classList.add('icon-failed');
}

onMounted(() => {
  window.addEventListener('keydown', handleEscKey);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey);
});

function handleEscKey(e) {
  if (e.key === 'Escape' && contextMenuVisible.value) {
    closeContextMenu();
  }
}

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuCard = ref(null);
const contextMenuRef = ref(null);
const hoveredCardId = ref(null);

function handleContextMenu(event, card) {
  contextMenuCard.value = card;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;

  nextTick(() => {
    const menu = contextMenuRef.value;
    if (!menu) return;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let fx = event.clientX;
    let fy = event.clientY;
    if (fx + menuWidth > vw) fx = vw - menuWidth - 10;
    if (fy + menuHeight > vh) fy = vh - menuHeight - 10;
    fx = Math.max(10, fx);
    fy = Math.max(10, fy);

    contextMenuX.value = fx;
    contextMenuY.value = fy;
  });
}

function closeContextMenu() {
  contextMenuVisible.value = false;
  contextMenuCard.value = null;
}

function onContextEdit() {
  if (contextMenuCard.value) {
    emit('contextEdit', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextDelete() {
  if (contextMenuCard.value) {
    emit('contextDelete', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextSelect() {
  if (contextMenuCard.value) {
    emit('toggleCardSelection', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextMove() {
  if (contextMenuCard.value) {
    if (!isCardSelected(contextMenuCard.value)) {
      emit('toggleCardSelection', contextMenuCard.value);
    }
    emit('openMovePanel');
  }
  closeContextMenu();
}

function onContextMoveUp() {
  if (contextMenuCard.value && props.manualSortEnabled) {
    emit('moveCard', contextMenuCard.value, 'up');
  }
  closeContextMenu();
}

function onContextMoveDown() {
  if (contextMenuCard.value && props.manualSortEnabled) {
    emit('moveCard', contextMenuCard.value, 'down');
  }
  closeContextMenu();
}

function onContextOpen() {
  if (contextMenuCard.value) {
    recordCardClick(contextMenuCard.value.id);
    window.open(contextMenuCard.value.url, '_blank');
  }
  closeContextMenu();
}

function onContextCopyUrl() {
  if (contextMenuCard.value) {
    const url = contextMenuCard.value.url;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).catch(() => {
        fallbackCopyText(url);
      });
    } else {
      fallbackCopyText(url);
    }
  }
  closeContextMenu();
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    console.error('Copy failed:', e);
  }
  document.body.removeChild(textarea);
}

function handleClickOutside(event) {
  if (contextMenuVisible.value) {
    closeContextMenu();
  }
}

watch(contextMenuVisible, (visible) => {
  if (visible) {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('scroll', closeContextMenu, { passive: true });
    return;
  }

  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('scroll', closeContextMenu);
}, { flush: 'post' });

function handleCardClick(event, card) {
  if (event.ctrlKey || event.metaKey || props.selectionMode) {
    event.preventDefault();
    event.stopPropagation();
    emit('toggleCardSelection', card);
  }
}

function handleLinkClick(event, card) {
  if (event.ctrlKey || event.metaKey || props.selectionMode) {
    event.preventDefault();
    event.stopPropagation();
    emit('toggleCardSelection', card);
  } else {
    recordCardClick(card.id);
  }
}

function recordCardClick(cardId) {
  fetch(`/api/cards/${cardId}/click`, { method: 'POST' }).catch(() => {});
  emit('cardClicked', cardId);
}

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('scroll', closeContextMenu);
});

function truncate(str) {
  if (!str) return '';
  return str.length > 20 ? str.slice(0, 20) + '...' : str;
}

const selectedCardIds = computed(() => new Set(props.selectedCards?.map(c => c.id) || []));

function isCardSelected(card) {
  return selectedCardIds.value.has(card.id);
}
</script>

<style scoped>
.container {
  max-width: 68rem;
  margin: 0 auto;
  margin-top: 2.5vh;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 18px;
  position: relative;
  z-index: 1;
  padding: 0 1rem;
  box-sizing: border-box;
}

@media (max-width: 1400px) {
  .container { 
    grid-template-columns: repeat(7, 1fr); 
    gap: 16px;
    max-width: 60rem;
  }
}

@media (max-width: 1200px) {
  .container { 
    grid-template-columns: repeat(6, 1fr); 
    gap: 14px;
    max-width: 52rem;
  }
}

@media (max-width: 1024px) {
  .container { 
    grid-template-columns: repeat(5, 1fr); 
    gap: 14px;
    max-width: 46rem;
    padding: 0 2vw;
  }
}

@media (max-width: 900px) {
  .container { 
    grid-template-columns: repeat(4, 1fr); 
    gap: 14px;
    padding: 0 4vw;
  }
  .link-item {
    min-height: 90px;
    height: auto;
    border-radius: 16px;
  }
  .icon-box {
    width: 34px;
    height: 34px;
  }
  .link-text {
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    padding: 0 16px;
  }
  .link-item {
    min-height: 100px;
    height: auto;
    border-radius: 18px;
  }
  .icon-box {
    width: 36px;
    height: 36px;
    margin-bottom: 8px;
  }
  .icon-box::before {
    font-size: 16px;
  }
  .link-text {
    font-size: 12px;
    font-weight: 500;
  }
  .card-link {
    padding: 14px 8px;
  }
}

@media (max-width: 480px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 0 12px;
  }
  .link-item {
    min-height: 90px;
    border-radius: 16px;
  }
  .icon-box {
    width: 32px;
    height: 32px;
    margin-bottom: 6px;
  }
  .icon-box::before {
    font-size: 14px;
  }
  .link-text {
    font-size: 11px;
    line-height: 1.3;
  }
  .card-link {
    padding: 12px 6px;
  }
}

@media (max-width: 380px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 0 10px;
  }
  .link-item {
    min-height: 85px;
    border-radius: 14px;
  }
  .icon-box {
    width: 28px;
    height: 28px;
    margin-bottom: 5px;
  }
  .icon-box::before {
    font-size: 12px;
  }
  .link-text {
    font-size: 10px;
    line-height: 1.25;
  }
  .card-link {
    padding: 10px 4px;
  }
}

.link-item {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  min-height: 92px;
  height: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.link-item:hover {
  background: rgba(255, 255, 255, 0.32);
  transform: translateY(-6px) scale(1.03);
  border-color: rgba(255, 255, 255, 0.4);
  z-index: 10;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.link-item:active {
  transform: translateY(-2px) scale(0.97);
  transition: transform 0.08s ease;
  background: rgba(255, 255, 255, 0.36);
}

/* 卡片悬浮提示 - 居中显示在卡片正下方 */
.card-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  z-index: 100;
  pointer-events: none;
  width: max-content;
  max-width: 240px;
}

.card-tooltip .tooltip-content {
  background: rgba(20, 20, 30, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, 0.92);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  word-break: break-word;
  text-align: left;
}

.tooltip-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tooltip-source {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tooltip .tooltip-content:has(.tooltip-desc) .tooltip-source {
  margin-top: 6px;
}

.link-item:hover .card-tooltip {
  animation: tooltipFadeIn 0.2s ease 0.3s both;
}

@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@media (hover: none) {
  .link-item:hover {
    transform: none;
    background: rgba(255, 255, 255, 0.22);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.08),
      0 1px 3px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .link-item:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.34);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
  .card-tooltip {
    display: none;
  }
}

.link-item.selected {
  border-color: rgba(99, 179, 237, 0.85);
  box-shadow: 
    0 0 0 2px rgba(99, 179, 237, 0.25), 
    0 4px 20px rgba(0, 0, 0, 0.1);
}

.card-grid.selection-mode .link-item {
  cursor: pointer;
}

.card-grid.selection-mode .link-item:hover {
  border-color: rgba(99, 179, 237, 0.5);
}

.card-grid.selection-mode .link-item .card-link {
  pointer-events: none;
}

.card-link {
  text-decoration: none;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  padding: 6px 8px 2px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  overflow: hidden;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}

/* 图标：字母兜底垫在底层，图片加载成功后覆盖 */
.icon-box {
  position: relative;
  width: 34px;
  height: 34px;
  flex: none;
  margin-bottom: 8px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-box::before {
  content: attr(data-letter);
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: hsl(var(--icon-hue, 210) 45% 42% / 0.55);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.link-icon {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 22%;
  background: rgba(255, 255, 255, 0.08);
  filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.25));
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
  -webkit-user-drag: none;
}

.link-icon.icon-loaded {
  opacity: 1;
}

/* 图标加载成功后遮住底下的字母兜底层，避免透过半透明底/透明 PNG 显出来 */
.icon-box:has(.link-icon.icon-loaded)::before {
  visibility: hidden;
}

.link-icon.icon-failed {
  display: none;
}

.link-item:hover .icon-box {
  transform: scale(1.12);
}

.link-text {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  color: #ffffff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  max-width: 100%;
  padding: 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  letter-spacing: 0.01em;
  pointer-events: none;
  max-height: calc(1.4em * 2);
}

.card-selected-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(99, 179, 237, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: bold;
  z-index: 10;
}

  .context-menu {
    position: fixed;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    padding: 6px;
    min-width: 150px;
    max-width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
    overflow-y: auto;
    z-index: 9999;
    animation: contextMenuFadeIn 0.15s ease;
  }

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}


.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  color: #333;
  font-size: 13px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.context-menu-item:hover {
  background: rgba(24, 144, 255, 0.1);
}

.context-menu-item.disabled {
  cursor: not-allowed;
  color: #bbb;
}

.context-menu-item.disabled:hover {
  background: transparent;
}

.context-menu-icon {
  margin-right: 10px;
  font-size: 14px;
}

.context-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 4px 0;
}
</style>
