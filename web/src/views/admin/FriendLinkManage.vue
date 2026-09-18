<template>
  <div class="friend-manage">
    <!-- 操作反馈 Toast -->
    <transition name="toast-fade">
      <div v-if="toastMsg" class="page-toast" :class="toastType">{{ toastMsg }}</div>
    </transition>
    <div class="friend-header">
      <div class="header-content">
        <h2 class="page-title">友情链接管理</h2>
        <p class="page-desc">管理首页友情链接的名称、地址与展示信息。</p>
      </div>
    </div>
    <div class="friend-add">
      <input v-model="newTitle" placeholder="网站名" class="input" />
      <input v-model="newUrl" placeholder="网站链接" class="input" />
      <input v-model="newLogo" placeholder="logo链接(可选)" class="input" />
      <button class="btn" @click="addFriend">添加友链</button>
    </div>
    <div class="friend-card">
      <table class="friend-table">
        <thead><tr><th>网站名</th><th>链接</th><th>Logo</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="friends.length === 0">
            <td colspan="4" class="empty-hint">暂无友链，请先添加</td>
          </tr>
          <tr v-for="f in friends" :key="f.id">
            <td><input v-model="f.title" @blur="updateFriend(f)" class="input" /></td>
            <td><input v-model="f.url" @blur="updateFriend(f)" class="input" /></td>
            <td><input v-model="f.logo" @blur="updateFriend(f)" class="input" placeholder="logo链接(可选)" /></td>
            <td><button class="btn btn-danger" @click="deleteFriend(f.id)">删除</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getFriends, addFriend as apiAddFriend, updateFriend as apiUpdateFriend, deleteFriend as apiDeleteFriend } from '../../api';
import { useDataSync } from '../../composables/useDataSync';

const friends = ref([]);
const newTitle = ref('');
const newUrl = ref('');
const newLogo = ref('');

// 页内反馈（替代原生 alert）
const toastMsg = ref('');
const toastType = ref('success');
function showToast(message, type = 'success') {
  toastMsg.value = message;
  toastType.value = type;
  setTimeout(() => { toastMsg.value = ''; }, 2500);
}

useDataSync('FriendLinkManage', ({ isSelfChange }) => {
  if (!isSelfChange) {
    loadFriends();
  }
});

onMounted(loadFriends);

async function loadFriends() {
  try {
    const res = await getFriends();
    friends.value = res.data;
  } catch (e) {
    showToast('加载友链失败: ' + (e.response?.data?.error || e.message), 'error');
  }
}
async function addFriend() {
  if (!newTitle.value || !newUrl.value) {
    showToast('请填写网站名和链接', 'error');
    return;
  }
  try {
    await apiAddFriend({ title: newTitle.value, url: newUrl.value, logo: newLogo.value });
    newTitle.value = '';
    newUrl.value = '';
    newLogo.value = '';
    loadFriends();
    showToast('友链添加成功', 'success');
  } catch (e) {
    showToast('添加失败: ' + (e.response?.data?.error || e.message), 'error');
  }
}
async function updateFriend(f) {
  try {
    await apiUpdateFriend(f.id, { title: f.title, url: f.url, logo: f.logo });
    showToast('已保存', 'success');
  } catch (e) {
    showToast('保存失败: ' + (e.response?.data?.error || e.message), 'error');
    await loadFriends();
  }
}
async function deleteFriend(id) {
  if (!confirm('确定要删除这个友链吗？')) return;
  
  // 乐观更新：立即从列表中移除
  const index = friends.value.findIndex(f => f.id === id);
  if (index > -1) {
    friends.value.splice(index, 1);
  }
  
  try {
    await apiDeleteFriend(id);
    showToast('友链已删除', 'success');
  } catch (error) {
    showToast('删除失败: ' + (error.response?.data?.error || error.message), 'error');
    // 失败时重新加载
    await loadFriends();
  }
}
</script>

<style scoped>
.friend-manage {
  max-width: 1400px;
  width: 90%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.page-title {
  text-align: center;
  font-size: 2rem;
  font-weight: bold;
  margin: 32px 0 8px 0;
  letter-spacing: 2px;
  color: #222;
}
.friend-header {
  width: 100%;
  margin-bottom: 20px;
}
.header-content {
  text-align: center;
}
.page-desc {
  margin: 0;
  color: #5f6b7a;
  font-size: 0.98rem;
  line-height: 1.6;
}
.friend-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.friend-card {
  width: 100%;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 32px 24px;
}
.input {
  width: 15rem;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #222;
  margin-right: 8px;
  height: 25px;
  font-size: 1rem;
}
.input:focus {
  outline: 2px solid #2566d8;
}
.btn {
  background: #2566d8;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 18px;
  cursor: pointer;
  margin-right: 8px;
  transition: background 0.2s;
}
.btn:hover {
  background: #174ea6;
}
.btn-danger {
  background: #e74c3c;
  display: inline-block;
  margin: 0 auto;
}
.btn-danger:hover {
  background: #c0392b;
}
.friend-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  color: #222;
  border-radius: 8px;
  overflow: hidden;
}
.friend-table th, .friend-table td {
  padding: 10px 14px;
  border: 1px solid #e3e6ef;
  height: 30px;
}
.friend-table th {
  background: #f5f7fa;
  color: #222;
  font-weight: bold;
}
.friend-table td input {
  width: 97%;
  background: #f9f9f9;
  color: #222;
  border: 1px solid #d0d7e2;
  border-radius: 4px;
  padding: 4px 4px;
  height: 30px;
  font-size: 1rem;
}
.friend-table th:last-child,
.friend-table td:last-child {
  text-align: center;
  vertical-align: middle;
}
@media (max-width: 768px) {
  .friend-manage {
    width: 92%;
    padding: 0 2vw;
  }
  .friend-add {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
  }
  .friend-header {
    margin-bottom: 16px;
  }
  .page-title {
    margin: 24px 0 8px 0;
    font-size: 1.6rem;
  }
  .page-desc {
    font-size: 0.92rem;
  }
  .friend-card {
    width: 100%;
    padding: 12px 2vw;
  }
  .friend-table {
    display: block;
    width: 100%;
    overflow-x: auto;
    font-size: 14px;
  }
  .friend-table thead, .friend-table tbody, .friend-table tr {
    display: table;
    width: 100%;
    table-layout: fixed;
  }
  .friend-table th, .friend-table td {
    padding: 8px 6px;
    font-size: 13px;
  }
  .input {
    width: 95%;
    min-width: 0;
    margin-right: 0;
    font-size: 14px;
    padding: 8px 8px;
    height: 32px !important;
  }
  .btn {
    width: 100%;
    margin-right: 0;
    padding: 8px 0;
    font-size: 14px;
  }
}

.empty-hint {
  text-align: center;
  color: #999;
  padding: 24px 0;
}

/* 页内反馈 Toast */
.page-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  max-width: 80vw;
  text-align: center;
}
.page-toast.success { background: #52c41a; }
.page-toast.error { background: #ff4d4f; }
.page-toast.info { background: #1890ff; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style> 
