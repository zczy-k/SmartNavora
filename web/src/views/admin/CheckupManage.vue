<template>
  <div class="checkup-page">
    <div class="checkup-tabs" role="tablist">
      <button
        v-for="tabItem in tabs"
        :key="tabItem.key"
        class="checkup-tab"
        :class="{ active: activeTab === tabItem.key }"
        role="tab"
        :aria-selected="activeTab === tabItem.key"
        @click="switchTab(tabItem.key)"
      >
        {{ tabItem.label }}
      </button>
    </div>
    <div class="checkup-body">
      <component :is="currentComponent" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import DuplicateManage from './DuplicateManage.vue';
import InvalidLinkManage from './InvalidLinkManage.vue';

const tabs = [
  { key: 'duplicate', label: '重复卡片' },
  { key: 'invalid', label: '失效链接' }
];

const activeTab = ref('duplicate');
const components = { duplicate: DuplicateManage, invalid: InvalidLinkManage };
const currentComponent = computed(() => components[activeTab.value]);

function hasActiveInvalidScan() {
  return typeof window !== 'undefined' && window.__smartnavoraInvalidScanActive === true;
}

function switchTab(next) {
  if (next === activeTab.value) return;
  if (activeTab.value === 'invalid' && hasActiveInvalidScan()) {
    if (!confirm('失效链接检测正在进行中。切换标签将导致当前检测进度和结果丢失，确定要切换吗？')) return;
  }
  activeTab.value = next;
}
</script>

<style scoped>
.checkup-page {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  padding: 8px 16px 0;
  box-sizing: border-box;
}
.checkup-tabs {
  display: flex;
  gap: 8px;
}
.checkup-tab {
  border: 1px solid #dbe2ee;
  border-bottom: none;
  background: #fff;
  color: #33415c;
  border-radius: 10px 10px 0 0;
  padding: 10px 22px;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.checkup-tab:hover:not(.active) {
  background: #f4f7fd;
}
.checkup-tab.active {
  background: #eaf1ff;
  color: #2566d8;
  font-weight: 600;
  border-color: #b9cdf5;
}
.checkup-body {
  width: 100%;
  border-top: 1px solid #e3e6ef;
}
</style>
