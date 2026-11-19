<template>
  <div class="home-container" @click="handleContainerClick">
    <!-- 移动端汉堡按钮 -->
    <button class="mobile-hamburger" @click.stop="mobileDrawerVisible = true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>
    
    <!-- 移动端抽屉导航 -->
    <MobileDrawer
      :visible="mobileDrawerVisible"
      :menus="menus"
      :activeMenuId="isFrequentView ? null : activeMenu?.id"
      :activeSubMenuId="isFrequentView ? null : activeSubMenu?.id"
      @close="mobileDrawerVisible = false"
      @selectMenu="handleDrawerMenuSelect"
      @selectSubMenu="handleDrawerSubMenuSelect"
    />
    
    <div class="menu-bar-fixed">
      <MenuBar
        :menus="menus"
        :activeId="isFrequentView ? null : activeMenu?.id"
        :activeSubMenuId="isFrequentView ? null : activeSubMenu?.id"
        :isFrequentActive="isFrequentView"
        @select="selectMenu"
        @selectFrequent="handleSelectFrequent"
        @addMenu="handleAddMenu"
        @editMenu="handleEditMenu"
        @deleteMenu="handleDeleteMenuWithAuth"
        @addSubMenu="handleAddSubMenu"
        @editSubMenu="handleEditSubMenu"
        @deleteSubMenu="handleDeleteSubMenuWithAuth"
        @menusReordered="handleMenusReordered"
        @moveSubMenuUp="handleMoveSubMenuUp"
        @moveSubMenuDown="handleMoveSubMenuDown"
      />
    </div>
    
    <div class="search-section">
      <div class="search-toolbar" v-if="selectedEngine">
        <div class="search-container">
          <div class="search-engine-dropdown" @click.stop>
            <button @click="toggleEngineDropdown" class="engine-selector" title="选择搜索引擎">
              <span class="engine-icon">
                <img 
                  :src="getEngineIcon(selectedEngine)" 
                  :alt="selectedEngine.label"
                  @error="handleEngineIconError"
                  class="engine-icon-img"
                />
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <transition name="dropdown">
              <div v-if="showEngineDropdown" class="engine-dropdown-menu" @click.stop>
                <div class="engine-menu-header">
                  <span>搜索引擎</span>
                  <button @click="openAddEngineModal" class="add-engine-icon-btn" title="添加自定义">+</button>
                </div>
                <div class="engine-menu-items">
                  <div v-for="(engine, index) in searchEngines" :key="engine.name" class="engine-menu-row">
                    <button
                      :class="['engine-menu-item', {active: selectedEngine.name === engine.name}]"
                      @click="selectEngineFromDropdown(engine)"
                    >
                      <span class="engine-icon">
                        <img :src="getEngineIcon(engine)" :alt="engine.label" @error="handleEngineIconError" class="engine-icon-img"/>
                      </span>
                      <span class="engine-label">{{ engine.label }}</span>
                    </button>
                    <div class="engine-actions">
                      <button v-if="index > 0" @click.stop="moveEngineUp(index)" class="engine-sort-btn" title="上移">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                      </button>
                      <button v-if="index < searchEngines.length - 1" @click.stop="moveEngineDown(index)" class="engine-sort-btn" title="下移">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                      <button v-if="engine.custom" @click.stop="deleteCustomEngine(engine)" class="delete-engine-btn-small" title="删除">×</button>
            </div>
          </div>
        </div>
      </div>
            </transition>
          </div>
          <input 
            v-model="searchQuery" 
            type="text" 
            :placeholder="selectedEngine ? selectedEngine.placeholder : '搜索...'" 
            class="search-input"
            @keyup.enter="handleSearch"
          />
          <button v-if="searchQuery" class="clear-btn" @click="clearSearch" aria-label="清空">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
          <button @click="handleSearch" class="search-btn" :title="`用 ${selectedEngine?.label || '搜索引擎'} 打开外网搜索（回车同效）`">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div v-if="searchQuery && selectedEngine" class="search-engine-hint">
            回车 / 点击搜索 → 用 <strong>{{ selectedEngine.label }}</strong> 打开外网检索 · 点下方卡片可直接打开
          </div>
        </div>
        
        <div class="toolbar-actions">
          <button
            class="toolbar-icon-btn cloud-sync-indicator"
            :class="cloudSyncIndicatorClass"
            @click="handleCloudStatusClick"
            :title="cloudSyncIndicatorTitle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              <line v-if="cloudSyncStatus !== 'synced'" x1="12" y1="9" x2="12" y2="15"/>
              <line v-if="cloudSyncStatus !== 'synced'" x1="9" y1="12" x2="15" y2="12"/>
              <path v-else d="M9 12l2 2 4-4"/>
            </svg>
          </button>

            <div class="global-sort-wrapper" @click.stop>
              <button class="toolbar-icon-btn" @click="toggleGlobalSortMenu" :title="'排序: ' + getSortLabel(globalSortType)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="4" y1="6" x2="16" y2="6"></line>
                  <line x1="4" y1="12" x2="12" y2="12"></line>
                  <line x1="4" y1="18" x2="8" y2="18"></line>
                </svg>
              </button>
<transition name="dropdown">
                  <div v-if="showGlobalSortMenu" class="global-sort-dropdown">
                  <div 
                    v-for="option in sortOptions" 
                    :key="option.type" 
                    class="sort-option"
                    :class="{ active: globalSortType.startsWith(option.type) }"
                    @click="selectGlobalSort(option.type)"
                  >
                    <span class="sort-option-icon">{{ option.icon }}</span>
                    <span>{{ option.label }}</span>
                    <span v-if="getSortDirection(option.type)" class="sort-direction">
                      {{ getSortDirection(option.type) === 'desc' ? '↓' : '↑' }}
                    </span>
                    <span v-if="globalSortType.startsWith(option.type)" class="sort-check">✓</span>
                  </div>
                </div>
              </transition>
          </div>
        </div>
      </div>

    </div>
    
    
    <!-- 左侧宣传条 -->
    <div v-if="leftPromos.length" class="promo-space-fixed left-promo-fixed">
      <a v-for="item in leftPromos" :key="item.id" :href="item.url" target="_blank">
        <img :src="item.img" alt="宣传" loading="lazy" />
      </a>
    </div>
    <!-- 右侧宣传条 -->
    <div v-if="rightPromos.length" class="promo-space-fixed right-promo-fixed">
      <a v-for="item in rightPromos" :key="item.id" :href="item.url" target="_blank">
        <img :src="item.img" alt="宣传" loading="lazy" />
      </a>
    </div>
    
    
    <!-- 批量选择悬浮工具栏 -->
    <transition name="selection-toolbar">
      <div v-if="selectedCards.length > 0" class="selection-toolbar">
        <div class="selection-info">
          <span class="selection-count">已选 {{ selectedCards.length }} 项</span>
          <button @click="clearSelection" class="clear-selection-btn" title="取消选择">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="selection-actions">
          <div class="group-select-wrapper" @click.stop>
            <button @click="toggleGroupSelectMenu" class="toolbar-btn select-btn" title="选择">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
              </svg>
              <span>选择</span>
            </button>
            <transition name="dropdown">
              <div v-if="showGroupSelectMenu" class="group-select-dropdown">
                <div class="group-select-item" @click="selectAllCards">
                  <span>全选</span>
                </div>
                <div class="group-select-item" @click="clearSelection">
                  <span>全不选</span>
                </div>
                <div v-if="groupedCards.length > 0" class="group-select-divider"></div>
                <template v-if="groupedCards.length > 0">
                  <div v-for="group in groupedCards" :key="group.key" class="group-select-item" @click="selectGroupCards(group)">
                    <span>{{ group.name || activeMenu?.name }}</span>
                    <span class="group-select-count">{{ sortAndFilterCards(group.cards, group.subMenuId).length }}</span>
                  </div>
                </template>
              </div>
            </transition>
          </div>
          <button @click="openMovePanel" class="toolbar-btn move-btn" title="移动到...">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>移动</span>
          </button>
          <button @click="openBatchSectionModal" class="toolbar-btn section-btn" title="批量设置分组">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h10M4 18h14"></path>
            </svg>
            <span>分组</span>
          </button>
          <button @click="batchDeleteSelected" class="toolbar-btn delete-btn" title="批量删除">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>删除</span>
          </button>
        </div>
      </div>
    </transition>
    
    <!-- 移动目标分类选择面板 -->
    <div v-if="showMovePanel" class="move-target-panel">
      <div class="move-target-header">
        <h4>移动到 ({{ selectedCards.length }})</h4>
        <button @click="cancelMove" class="cancel-move-btn">×</button>
      </div>
      <div class="move-target-list">
        <div v-for="menu in menus" :key="menu.id" class="target-menu-group">
          <button 
            @click="moveCardToCategory(menu.id, null)" 
            class="target-menu-btn"
            :class="{ 'active': targetMenuId === menu.id && targetSubMenuId === null }"
          >
            {{ menu.name }}
          </button>
          <div v-if="menu.subMenus && menu.subMenus.length" class="target-submenu-list">
            <button 
              v-for="subMenu in menu.subMenus" 
              :key="subMenu.id"
              @click="moveCardToCategory(menu.id, subMenu.id)" 
              class="target-submenu-btn"
              :class="{ 'active': targetMenuId === menu.id && targetSubMenuId === subMenu.id }"
            >
              ⤷ {{ subMenu.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 常用视图（搜索激活时切换到全局搜索结果，见下方 single 视图） -->
    <div class="cards-single-container" v-if="isFrequentView && !isSearchActive">
      <div class="card-group-header single-header">
        <div class="group-header-left">
          <span class="group-name">常用站点</span>
          <span class="group-count">{{ frequentCards.length }}</span>
        </div>
      </div>
      <div v-if="frequentCards.length > 0">
        <CardGrid
          :cards="frequentCards"
          :selectedCards="selectedCards"
          :selectionMode="selectedCards.length > 0"
          :showSource="true"
          :manual-sort-enabled="canManualSort"
          @contextEdit="handleContextEdit"
          @contextDelete="handleContextDelete"
          @toggleCardSelection="handleToggleCardSelection"
          @openMovePanel="openMovePanel"
          @requireAuth="handleRequireAuth"
          @cardClicked="handleCardClicked"
          @quickAdd="openQuickAddModal"
          @moveCard="handleMoveCard"
          @click.stop
        />
      </div>
      <!-- 加载中的骨架屏，避免空白闪烁 -->
      <div v-else-if="isFrequentLoading" class="frequent-skeleton">
        <div v-for="i in 8" :key="i" class="skeleton-card">
          <div class="skeleton-icon"></div>
          <div class="skeleton-text"></div>
        </div>
      </div>
      <div v-else class="frequent-empty-state">
        <span class="frequent-empty-icon">🔥</span>
        <p>还没有使用记录</p>
        <p class="frequent-empty-hint">点击卡片访问后，常用的站点会自动出现在这里</p>
      </div>
    </div>

    <!-- 卡片按分类分组显示（常用视图下隐藏，避免与常用站点区块重复） -->
    <div class="cards-grouped-container" v-if="!isFrequentView && !activeSubMenu && activeMenu && groupedCards.length > 0">
      <template v-for="(group, index) in groupedCards" :key="group.key">
        <div v-if="sortAndFilterCards(group.cards, group.subMenuId).length > 0" class="card-group">
          <div class="card-group-header" @click="toggleGroupCollapse(group.key)">
            <div class="group-header-left">
              <button class="collapse-btn" :class="{ collapsed: isGroupCollapsed(group.key) }">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <span v-if="group.name" class="group-name">{{ group.name }}</span>
              <span v-else class="group-name main-category-name">{{ activeMenu.name }}</span>
              <span class="group-count">{{ sortAndFilterCards(group.cards, group.subMenuId).length }}</span>
            </div>
          </div>
<transition name="group-collapse">
              <div v-if="!isGroupCollapsed(group.key)">
                <template v-for="sec in groupBySection(sortAndFilterCards(group.cards, group.subMenuId))" :key="sec.section || '__default__'">
                  <div v-if="sec.section" class="section-header" @click="toggleSectionCollapse(sec.section, group.subMenuId)">
                    <button class="collapse-btn section-collapse-btn" :class="{ collapsed: isSectionCollapsed(sec.section, group.subMenuId) }">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                    <span v-if="editingSection !== sec.section" class="section-title" @dblclick.stop="startEditSection(sec.section, group.subMenuId)" title="双击重命名分组">
                      {{ sec.section }}
                      <svg class="section-edit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </span>
                    <span v-else class="section-title section-editing">
                      <input v-model="editingSectionValue" class="section-rename-input" @keyup.enter="saveSectionRename(group.subMenuId)" @keyup.escape="editingSection = ''" @blur="saveSectionRename(group.subMenuId)" ref="sectionRenameInput" />
                    </span>
                    <span class="section-count">{{ sec.cards.length }}</span>
                    <button v-if="editingSection !== sec.section" class="section-delete-btn" @click.stop="deleteSection(sec.section, group.subMenuId)" title="取消分组">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
                  <transition name="group-collapse">
                    <div v-if="sec.section ? !isSectionCollapsed(sec.section, group.subMenuId) : true">
                      <CardGrid
                        :cards="sec.cards"
                        :selectedCards="selectedCards"
                        :selectionMode="selectedCards.length > 0"
                        :categoryId="activeMenu?.id"
                        :subCategoryId="group.subMenuId"
                        :manual-sort-enabled="canManualSort"
                        @contextEdit="handleContextEdit"
                        @contextDelete="handleContextDelete"
                        @toggleCardSelection="handleToggleCardSelection"
                        @openMovePanel="openMovePanel"
                        @requireAuth="handleRequireAuth"
                        @cardClicked="handleCardClicked"
                        @quickAdd="openQuickAddModal"
                        @moveCard="handleMoveCard"
                        @click.stop
                      />
                    </div>
                  </transition>
                </template>
              </div>
            </transition>
        </div>
      </template>
    </div>
    <!-- 选择子菜单或搜索时，直接显示卡片（含常用视图下的全局搜索） -->
    <div v-else-if="!isFrequentView || isSearchActive" class="cards-single-container">
      <div v-if="(activeMenu || isSearchActive) && sortedFilteredCards.length > 0" class="card-group-header single-header">
        <div class="group-header-left">
          <span class="group-name">{{ isSearchActive ? '搜索结果' : (activeSubMenu?.name || activeMenu?.name || '搜索结果') }}</span>
          <span class="group-count">{{ sortedFilteredCards.length }}</span>
        </div>
      </div>
      <template v-for="sec in groupBySection(sortedFilteredCards)" :key="sec.section || '__default__'">
        <div v-if="sec.section" class="section-header" @click="toggleSectionCollapse(sec.section, activeSubMenu?.id || null)">
          <button class="collapse-btn section-collapse-btn" :class="{ collapsed: isSectionCollapsed(sec.section, activeSubMenu?.id || null) }">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <span v-if="editingSection !== sec.section" class="section-title" @dblclick.stop="startEditSection(sec.section, activeSubMenu?.id || null)" title="双击重命名分组">
            {{ sec.section }}
            <svg class="section-edit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </span>
          <span v-else class="section-title section-editing">
            <input v-model="editingSectionValue" class="section-rename-input" @keyup.enter="saveSectionRename(activeSubMenu?.id || null)" @keyup.escape="editingSection = ''" @blur="saveSectionRename(activeSubMenu?.id || null)" />
          </span>
          <span class="section-count">{{ sec.cards.length }}</span>
          <button v-if="editingSection !== sec.section" class="section-delete-btn" @click.stop="deleteSection(sec.section, activeSubMenu?.id || null)" title="取消分组">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
        <transition name="group-collapse">
          <div v-if="sec.section ? !isSectionCollapsed(sec.section, activeSubMenu?.id || null) : true">
            <CardGrid
              :cards="sec.cards"
              :selectedCards="selectedCards"
              :selectionMode="selectedCards.length > 0"
              :categoryId="activeMenu?.id"
              :subCategoryId="activeSubMenu?.id"
              :manual-sort-enabled="canManualSort"
              @contextEdit="handleContextEdit"
              @contextDelete="handleContextDelete"
              @toggleCardSelection="handleToggleCardSelection"
              @openMovePanel="openMovePanel"
              @requireAuth="handleRequireAuth"
              @cardClicked="handleCardClicked"
              @quickAdd="openQuickAddModal"
              @moveCard="handleMoveCard"
              @click.stop
            />
          </div>
        </transition>
      </template>
    </div>
    
    <!-- 背景选择面板 -->
    <transition name="bg-panel">
      <div v-if="showBgPanel" class="bg-panel-overlay" @click="showBgPanel = false">
        <div class="bg-panel" @click.stop>
          <div class="bg-panel-header">
            <h4>选择背景</h4>
            <button class="panel-close-btn" @click="showBgPanel = false">×</button>
          </div>
          <div class="bg-panel-content">
            <div class="bg-grid">
              <div 
                v-for="bg in presetBackgrounds" 
                :key="bg.id" 
                class="bg-item"
                :class="{ active: currentBgId === bg.id }"
                @click="selectBackground(bg)"
              >
                <img :src="bg.thumb" :alt="bg.name" loading="lazy" @error="e => e.target.src = '/background.webp'" />
                <span class="bg-item-name">{{ bg.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
    

    
    <!-- 批量添加弹窗 -->
    <div v-if="showBatchAddModal" class="modal-overlay">
      <div class="modal-content batch-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ batchStep === 1 ? '验证密码' : batchStep === 2 ? '输入网址' : '预览并选择' }}</h3>
          <button @click="closeBatchAdd" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- 步骤 1: 密码验证 -->
          <div v-if="batchStep === 1" class="batch-step">
            <p class="batch-tip">请输入管理员密码以继续：</p>
            <input 
              v-model="batchPassword" 
              type="password" 
              placeholder="请输入管理员密码"
              class="batch-input"
              @keyup.enter="verifyBatchPassword"
            />
            <div class="remember-password-wrapper">
              <label>
                <input type="checkbox" v-model="rememberPassword" />
                <span>信任此设备</span>
              </label>
            </div>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="closeBatchAdd" class="btn btn-cancel">取消</button>
              <button @click="verifyBatchPassword" class="btn btn-primary" :disabled="batchLoading">
                {{ batchLoading ? '验证中...' : '确认' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤 2: 输入网址 -->
          <div v-if="batchStep === 2" class="batch-step">
            <p class="batch-tip">请输入需要添加的网址，每行一个：</p>
            <textarea 
              v-model="batchUrls" 
              placeholder="例如：&#10;https://github.com&#10;https://google.com&#10;https://stackoverflow.com"
              class="batch-textarea"
              rows="10"
            ></textarea>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="handleBackToPassword" class="btn btn-cancel">上一步</button>
              <button @click="parseUrls" class="btn btn-primary" :disabled="batchLoading || !batchUrls.trim()">
                {{ batchLoading ? '解析中...' : '下一步' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤 3: 预览选择 -->
          <div v-if="batchStep === 3" class="batch-step">
            <p class="batch-tip">请选择需要添加的网站：</p>
            <div class="batch-section-bar">
              <label>统一分组：</label>
              <input type="text" v-model="batchSection" class="batch-section-input" placeholder="为所有选中卡片设置同一分组（可选）" list="section-datalist" @change="applyBatchSection" />
              <button v-if="batchSection" class="btn sm" @click="applyBatchSection">应用到全部</button>
            </div>
            <div class="batch-preview-list">
              <div
                v-for="(item, index) in parsedCards"
                :key="index"
                class="batch-preview-item"
                :class="{ 'is-duplicate': item.isDuplicate, 'is-similar-duplicate': item.isSimilarDuplicate }"
              >
                <input type="checkbox" v-model="item.selected" :id="`card-${index}`" />
                <div class="batch-card-preview">
                  <!-- 重复标记徽章 -->
                  <div v-if="item.isDuplicate" class="duplicate-badge">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                     <span>重复</span>
                   </div>
                   <div v-else-if="item.isSimilarDuplicate" class="duplicate-badge similar">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <circle cx="12" cy="12" r="10"></circle>
                       <path d="M12 8v4"></path>
                       <path d="M12 16h.01"></path>
                     </svg>
                     <span>同站不同页</span>
                   </div>
                   <img :src="item.logo" :alt="item.title" class="batch-card-logo" @error="e => e.target.src = '/default-favicon.png'" />
                   <div class="batch-card-info">
                    <div class="batch-edit-field">
                      <label>标题：</label>
                      <input type="text" v-model="item.title" class="batch-edit-input" />
                    </div>
                    <div class="batch-edit-field">
                      <label>Logo：</label>
                      <input type="text" v-model="item.logo" class="batch-edit-input" />
                    </div>
                    <div class="batch-edit-field">
                      <label>描述：</label>
                      <textarea v-model="item.description" class="batch-edit-textarea" rows="2"></textarea>
                    </div>
                    <div class="batch-edit-field">
                      <label>分组：</label>
                      <input type="text" v-model="item.section" class="batch-edit-input" placeholder="可选，如：AI 工具、开发环境" list="section-datalist" />
                    </div>
                    <p class="batch-card-url">{{ item.url }}</p>
                    <p v-if="!item.success" class="batch-card-warning">⚠️ {{ item.error }}</p>
                    <!-- 重复提示信息 -->
                    <p v-if="item.isDuplicate && item.duplicateOf" class="batch-card-duplicate-info">
                      ⚠️ 与已存在的卡片重复：<strong>{{ item.duplicateOf.title }}</strong>
                    </p>
                    <p v-else-if="item.isSimilarDuplicate && item.duplicateOf" class="batch-card-duplicate-info similar">
                      ℹ️ 检测到同主域名的其他页面：<strong>{{ item.duplicateOf.title }}</strong>。
                      已存在：<a :href="item.duplicateOf.url" target="_blank" rel="noopener noreferrer" :title="item.duplicateOf.url">{{ item.duplicateOf.urlPreview }}</a>；
                      当前：<a :href="item.url" target="_blank" rel="noopener noreferrer" :title="item.url">{{ item.urlPreview }}</a>。
                      路径差异：<code>{{ item.duplicateOf.path }}</code> → <code>{{ item.currentPath }}</code>。如需收藏当前路径可直接保留勾选后添加。
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="batchStep = 2" class="btn btn-cancel">上一步</button>
              <button @click="addSelectedCards" class="btn btn-primary" :disabled="batchLoading || selectedCardsCount === 0">
                {{ batchLoading ? '添加中...' : `添加 (${selectedCardsCount})` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-actions">
          <button @click="showFriendLinks = true" class="friend-link-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            友情链接
          </button>
          <span class="footer-divider"></span>
          <div class="footer-tools">
            <button v-if="activeMenu" @click="openBatchAddModal" class="footer-tool-btn" title="批量添加网站">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="6" height="6" rx="1"/>
                <rect x="12" y="2" width="6" height="6" rx="1"/>
                <rect x="2" y="12" width="6" height="6" rx="1"/>
                <rect x="12" y="12" width="6" height="6" rx="1" opacity="0.4"/>
                <path d="M15 13v5M12.5 15.5h5" stroke-width="1.8"/>
              </svg>
            </button>
            <button @click="showBgPanel = true" class="footer-tool-btn" title="更换背景">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="3" width="16" height="14" rx="2"/>
                <circle cx="6.5" cy="7.5" r="1.5" fill="currentColor"/>
                <path d="M2 14l4-4 3 3 5-5 4 4v3a2 2 0 01-2 2H4a2 2 0 01-2-2v-1z" fill="currentColor" opacity="0.3"/>
              </svg>
            </button>
            <button v-if="isDeviceTrusted()" @click="revokeTrust" class="footer-tool-btn" title="取消信任此设备">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M10 2L3 6v5c0 4.42 2.98 8.55 7 9 4.02-.45 7-4.58 7-9V6l-7-4z"/>
                <path d="M7 10l2 2 4-4" stroke-width="1.8"/>
              </svg>
            </button>
          </div>
        </div>
        <p class="copyright">Copyright © 2025 SmartNavora | <a href="https://github.com/zczy-k/SmartNavora" target="_blank" class="footer-link">Powered by zczy-k</a></p>
      </div>
    </footer>

    <!-- 权限验证弹窗 -->
    <div v-if="showPasswordModal" class="modal-overlay auth-modal-overlay" @click.self="closePasswordModal" @keydown.esc="closePasswordModal">
      <div class="modal-content auth-modal-content" @click.stop>
        <div class="modal-header">
          <h3>验证密码</h3>
          <button @click="closePasswordModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: #666;">请输入管理员密码以继续操作</p>
          <div class="password-input-wrapper">
            <input 
              ref="authPasswordInput"
              v-model="authPassword" 
              :type="showAuthPasswordText ? 'text' : 'password'" 
              placeholder="请输入管理员密码"
              class="batch-input password-input"
              :class="{ 'shake': authShake }"
              autocomplete="current-password"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              @keydown.stop
              @keyup.stop
              @keyup.enter="verifyAuthPassword"
            />
            <button 
              type="button" 
              class="password-toggle-btn" 
              @mousedown.prevent
              @click.stop="showAuthPasswordText = !showAuthPasswordText"
              :title="showAuthPasswordText ? '隐藏密码' : '显示密码'"
            >
              <svg v-if="showAuthPasswordText" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <div class="remember-password-wrapper enhanced">
            <label class="remember-checkbox">
              <input type="checkbox" v-model="trustDevice" />
              <span class="checkbox-label">信任此设备</span>
            </label>
            <span v-if="isDeviceTrusted()" class="trust-status">已信任</span>
          </div>
          <transition name="error-fade">
            <p v-if="authError" class="batch-error auth-error">{{ authError }}</p>
          </transition>
          <div class="batch-actions" style="margin-top: 20px;">
            <button @click="closePasswordModal" class="btn btn-cancel">取消</button>
            <button @click="verifyAuthPassword" class="btn btn-primary" :disabled="authLoading || !authPassword">
              <span v-if="authLoading" class="btn-loading"></span>
              {{ authLoading ? '验证中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 友情链接弹窗 -->
    <FriendLinksModal :show="showFriendLinks" :friends="friendLinks" @close="showFriendLinks = false" />
    
    <!-- 菜单编辑弹窗 -->
    <MenuEditModal
      v-if="showMenuModal"
      :mode="menuModalMode"
      :type="menuModalType"
      :data="editingMenuData"
      :hint="menuInsertHint"
      :loading="menuModalLoading"
      @save="saveMenuModal"
      @close="showMenuModal = false"
    />
    
    <!-- 卡片编辑弹窗 -->
    <div v-if="showEditCardModal" class="modal-overlay">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>编辑卡片</h3>
          <button @click="closeEditCardModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="edit-card-form">
            <div class="form-group">
              <label>标题</label>
              <div class="input-with-ai">
                <input 
                  v-model="cardEditForm.title" 
                  type="text" 
                  placeholder="请输入标题"
                  class="batch-input"
                />
                <button 
                  @click="generateAIName" 
                  class="ai-btn" 
                  :class="{ 'ai-btn-disabled': !aiConfigured }"
                  :disabled="aiGeneratingName || !aiConfigured"
                  :title="aiConfigured ? 'AI 生成名称' : '请先在后台配置 AI 服务'"
                >
                  {{ aiGeneratingName ? '⏳' : '✨' }}
                </button>
              </div>
              <div v-if="aiOptions.field === 'title'" class="ai-options-popover">
                <div v-if="aiOptions.loading" class="ai-options-loading">生成中…</div>
                <template v-else>
                  <div v-for="(opt, i) in aiOptions.list" :key="i" class="ai-option-item" @click="applyAIOption('title', opt)">{{ opt }}</div>
                  <div class="ai-options-actions">
                    <button type="button" @click="generateAIName" class="ai-option-regen">换一批</button>
                    <button type="button" @click="closeAIOptions" class="ai-option-cancel">取消</button>
                  </div>
                </template>
              </div>
            </div>
            <div class="form-group">
              <label>网址</label>
              <input 
                v-model="cardEditForm.url" 
                type="url" 
                placeholder="请输入网址"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>Logo 链接</label>
              <input 
                v-model="cardEditForm.logo_url" 
                type="text" 
                placeholder="留空则自动获取站点图标，也可粘贴自定义图片地址"
                class="batch-input"
              />
              <div class="form-hint">留空时由服务器自动抓取；填了就优先显示你给的图片地址</div>
            </div>
            <div class="form-group">
              <label>描述</label>
              <div class="input-with-ai">
                <textarea 
                  v-model="cardEditForm.desc" 
                  placeholder="请输入描述"
                  class="batch-textarea"
                  rows="3"
                ></textarea>
                <button 
                  @click="generateAIDescription" 
                  class="ai-btn" 
                  :class="{ 'ai-btn-disabled': !aiConfigured }"
                  :disabled="aiGenerating || !aiConfigured"
                  :title="aiConfigured ? 'AI 生成描述' : '请先在后台配置 AI 服务'"
                >
                  {{ aiGenerating ? '⏳' : '✨' }}
                </button>
              </div>
              <div v-if="aiOptions.field === 'desc'" class="ai-options-popover">
                <div v-if="aiOptions.loading" class="ai-options-loading">生成中…</div>
                <template v-else>
                  <div v-for="(opt, i) in aiOptions.list" :key="i" class="ai-option-item ai-option-desc" @click="applyAIOption('desc', opt)">{{ opt }}</div>
                  <div class="ai-options-actions">
                    <button type="button" @click="generateAIDescription" class="ai-option-regen">换一批</button>
                    <button type="button" @click="closeAIOptions" class="ai-option-cancel">取消</button>
                  </div>
                </template>
              </div>
            </div>
            <div class="form-group">
              <label>分组 <span class="field-hint">（可选，用于在子菜单内进一步分类）</span></label>
              <input
                v-model="cardEditForm.section"
                placeholder="例如：AI 工具、开发环境、数据库"
                class="batch-input"
                maxlength="30"
                list="section-datalist"
              />
            </div>
            <p v-if="editError" class="batch-error">{{ editError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="closeEditCardModal" class="btn btn-cancel">取消</button>
              <button @click="saveCardEdit" class="btn btn-primary" :disabled="editLoading">
                {{ editLoading ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快速添加卡片弹窗 -->
    <QuickAddModal
      v-if="showQuickAddModal"
      :form="quickAddForm"
      :error="quickAddError"
      :loading="quickAddLoading"
      @save="saveQuickAdd"
      @close="showQuickAddModal = false"
    />

    <!-- 批量设置分组弹窗 -->
    <BatchSectionModal
      v-if="showBatchSectionModal"
      :count="selectedCards.length"
      v-model:value="batchSectionValue"
      :loading="batchSectionLoading"
      @apply="applyBatchSectionToSelected"
      @close="showBatchSectionModal = false"
    />

    <!-- 添加搜索引擎弹窗 -->
    <div v-if="showAddEngineModal" class="modal-overlay">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ engineStep === 1 ? '添加搜索引擎 - 输入URL' : '添加搜索引擎 - 编辑信息' }}</h3>
          <button @click="closeAddEngineModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- 步骤1：输入URL -->
          <div v-if="engineStep === 1">
            <div class="form-group">
              <label>搜索引擎URL</label>
              <input 
                v-model="engineUrl" 
                type="url" 
                placeholder="例如：https://www.google.com"
                class="batch-input"
                @keyup.enter="parseEngineUrl"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">输入搜索引擎的主页地址，系统会自动解析</p>
            </div>
            <p v-if="engineError" class="batch-error">{{ engineError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="closeAddEngineModal" class="btn btn-cancel">取消</button>
              <button @click="parseEngineUrl" class="btn btn-primary" :disabled="engineLoading || !engineUrl">
                {{ engineLoading ? '解析中...' : '下一步' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤2：编辑解析后的信息 -->
          <div v-if="engineStep === 2">
            <div class="form-group">
              <label>名称</label>
              <input 
                v-model="newEngine.name" 
                type="text" 
                placeholder="例如：Google"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>搜索URL模板</label>
              <input 
                v-model="newEngine.searchUrl" 
                type="text" 
                placeholder="例如：https://www.google.com/search?q={searchTerms}"
                class="batch-input"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">使用 {searchTerms} 作为搜索关键词占位符</p>
            </div>
            <div class="form-group">
              <label>关键词（可选）</label>
              <input 
                v-model="newEngine.keyword" 
                type="text" 
                placeholder="例如：google"
                class="batch-input"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">用于快捷键搜索，例如输入 'g 关键词' 使用Google搜索</p>
            </div>
            <p v-if="engineError" class="batch-error">{{ engineError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="engineStep = 1" class="btn btn-cancel">上一步</button>
              <button @click="addCustomEngine" class="btn btn-primary" :disabled="engineLoading">
                {{ engineLoading ? '添加中...' : '添加' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Toast 提示 -->
    <transition name="toast">
      <div v-if="showToast" class="toast-notification">
        {{ toastMessage }}
      </div>
    </transition>
    
    <!-- 操作进度弹窗 -->
    <transition name="modal">
      <ProgressModal
        v-if="showProgressModal"
        :status="progressStatus"
        :title="progressTitle"
        :message="progressMessage"
        @close="closeProgressModal"
      />
    </transition>

    <!-- 云端版本落后提醒弹窗 -->
    <BackupSyncModal
      v-if="showBackupSyncModal"
      v-model:password="backupSyncPassword"
      :error="backupSyncError"
      :success="backupSyncSuccess"
      :loading="backupSyncLoading"
      @sync="handleBackupSync"
      @close="showBackupSyncModal = false"
    />
  </div>

  <!-- 分组自动补全 -->
  <datalist id="section-datalist">
    <option v-for="s in sectionSuggestions" :key="s" :value="s">{{ s }}</option>
  </datalist>
</template>

<script setup>
import { ref, onMounted, computed, defineAsyncComponent, onUnmounted, nextTick, watch, h } from 'vue';
import { getMenus, getCards, getAllCards, getFrequentCards, getPromos, getFriends, verifyPassword, verifyToken, batchParseUrls, batchAddCards, batchUpdateCards, addCard, deleteCard, updateCard, getSearchEngines, parseSearchEngine, addSearchEngine, deleteSearchEngine, reorderSearchEngines, getDataVersion, addMenu, updateMenu, deleteMenu, addSubMenu, updateSubMenu, deleteSubMenu, getClientId, checkWebdavVersion, setAuthChallengeHandler, getCardSections, removeFromFrequent, instance as apiInstance } from '../api';
import { useDataSync } from '../composables/useDataSync';

// AI API 调用（使用 api.js 的 instance 以确保全局 401 拦截器生效）
const api = {
  get: (url) => apiInstance.get(url.replace(/^\/api/, '')),
  post: (url, data) => apiInstance.post(url.replace(/^\/api/, ''), data),
  put: (url, data) => apiInstance.put(url.replace(/^\/api/, ''), data)
};
import MenuBar from '../components/MenuBar.vue';
import MobileDrawer from '../components/MobileDrawer.vue';
const FriendLinksModal = defineAsyncComponent(() => import('../components/FriendLinksModal.vue'));
const ProgressModal = defineAsyncComponent(() => import('../components/ProgressModal.vue'));
const MenuEditModal = defineAsyncComponent(() => import('../components/MenuEditModal.vue'));
const QuickAddModal = defineAsyncComponent(() => import('../components/QuickAddModal.vue'));
const BatchSectionModal = defineAsyncComponent(() => import('../components/BatchSectionModal.vue'));
const BackupSyncModal = defineAsyncComponent(() => import('../components/BackupSyncModal.vue'));
import { filterCardsWithPinyin } from '../utils/pinyin';
import { getDuplicateMatch, extractPathname, formatUrlPreview, isMultiPathDomainAllowed } from '../utils/urlNormalizer';
const importCardGrid = () => import('../components/CardGrid.vue');
const retryCardGridImport = (tries) => importCardGrid().catch((err) => {
  if (tries <= 0) throw err;
  return new Promise((r) => setTimeout(r, 400)).then(() => retryCardGridImport(tries - 1));
});
const reloadOnceForChunk = () => {
  const key = 'cardgrid-chunk-reload-at';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last < 15000) return false;
  sessionStorage.setItem(key, String(Date.now()));
  location.reload();
  return true;
};
const CardGridError = {
  name: 'CardGridError',
  render: () => h('div', { style: 'padding:24px;text-align:center;color:#fff;opacity:.85' }, '卡片组件加载失败，请刷新页面（Ctrl+F5）')
};
// 重新部署后浏览器可能仍持有旧 index.html，异步 chunk 会 404：重试后整页刷新拿新入口，仍失败则显式提示而不是静默空白
const CardGrid = defineAsyncComponent({
  loader: () => retryCardGridImport(2).catch((err) => {
    if (reloadOnceForChunk()) return new Promise(() => {});
    throw err;
  }),
  errorComponent: CardGridError,
  delay: 200
});

const mobileDrawerVisible = ref(false);
// 存储"展开"状态而非"折叠"
// 默认全部展开：只有当用户设置过折叠/展开偏好（或服务端已有数据）时，才按展开集合判断
const hasExpandedPreference = ref(
  localStorage.getItem('expandedGroups') !== null ||
  localStorage.getItem('collapsedGroups') !== null
);
const expandedGroups = ref(new Set(JSON.parse(localStorage.getItem('expandedGroups') || '[]')));

// 迁移旧版 collapsedGroups → expandedGroups
try {
  const oldData = localStorage.getItem('collapsedGroups');
  if (oldData !== null && localStorage.getItem('expandedGroups') === null) {
    const collapsed = new Set(JSON.parse(oldData));
    // 展开集 = 已知所有分组 - 折叠集。但我们不知道所有分组，
    // 所以采用保守策略：如果旧数据为空（全部展开），新数据也全部展开（空集 = 全部折叠，不迁移）
    // 如果旧数据非空，保持旧用户原有体验：折叠集 = 展开集的补集
    if (collapsed.size > 0) {
      // 无法精确求补集，保守保留折叠集中的项为不展开
      // 用户可自行点击展开
    }
    localStorage.removeItem('collapsedGroups');
  }
} catch (e) {}

// 展开状态变化时自动同步到服务端
let _skipServerSync = true;
watch(expandedGroups, () => {
  if (_skipServerSync) return;
  saveExpandedGroupsToServer();
}, { deep: true });

const menus = ref([]);
const activeMenu = ref(null);
const activeSubMenu = ref(null);
const cards = ref([]);
const allCards = ref([]); // 存储所有菜单的卡片，用于搜索
const searchQuery = ref('');
const debouncedSearchQuery = ref('');
let searchDebounceTimer = null;

// 常用视图状态
const isFrequentView = ref(false);
const frequentCards = ref([]);
const isFrequentLoading = ref(false);

function filterCardsByActiveCriteria(cardList, keyword = debouncedSearchQuery.value.trim()) {
  let result = Array.isArray(cardList) ? [...cardList] : [];

  if (keyword) {
    result = filterCardsWithPinyin(result, keyword);
  }

  return result;
}

watch(searchQuery, (value) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    const keyword = value.trim();
    debouncedSearchQuery.value = keyword;
    if (keyword && allCards.value.length === 0) {
      loadAllCardsForSearch().catch((e) => {
        console.error('加载全站搜索卡片失败:', e);
      });
    }
  }, 120);
}, { immediate: true });

// 排序和过滤后的卡片
const sortedFilteredCards = computed(() => {
  const sourceCards = debouncedSearchQuery.value ? allCards.value : cards.value;
  return applySorting(filterCardsByActiveCriteria(sourceCards));
});

// 搜索激活状态：搜索框有内容时为 true。
// 用于让「常用」视图在搜索时也切换到全局搜索结果（与其它标签栏行为一致）。
const isSearchActive = computed(() => !!debouncedSearchQuery.value.trim());

// 应用排序逻辑
function applySorting(cardList) {
  if (!cardList || cardList.length === 0) return cardList;
  
  const sorted = [...cardList];
  
  switch (globalSortType.value) {
    case 'name_asc':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
      break;
    case 'name_desc':
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'zh-CN'));
      break;
    case 'time_desc':
      sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      break;
    case 'time_asc':
      sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      break;
    case 'freq_desc':
      sorted.sort((a, b) => (b.click_count || 0) - (a.click_count || 0));
      break;
    case 'freq_asc':
      sorted.sort((a, b) => (a.click_count || 0) - (b.click_count || 0));
      break;
    case 'default':
    default:
      sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      break;
  }
  
  return sorted;
}

// 用于分组显示时的排序和过滤
function sortAndFilterCards(cardList, subMenuId) {
  if (!cardList) return [];

  return applySorting(filterCardsByActiveCriteria(cardList));
}

// 将卡片按 section 字段分组，返回 [{ section: '分组名', cards: [...] }, ...]
// 没有 section 的卡片归入空字符串组（不显示标题）
function groupBySection(cardList) {
  if (!cardList || cardList.length === 0) return [];
  const map = new Map();
  const order = [];
  for (const card of cardList) {
    const sec = card.section || '';
    if (!map.has(sec)) {
      map.set(sec, []);
      order.push(sec);
    }
    map.get(sec).push(card);
  }
  // 已分组的排前面，未分组的（空字符串）排最后
  order.sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (a !== '' && b === '') return -1;
    return 0;
  });
  return order.map(sec => ({ section: sec, cards: map.get(sec) }));
}
const leftPromos = ref([]);
const rightPromos = ref([]);
const showFriendLinks = ref(false);
const friendLinks = ref([]);

// 批量添加相关状态
const showBatchAddModal = ref(false);
const batchStep = ref(1); // 1:密码验证 2:输入网址 3:预览选择
const batchPassword = ref('');
const batchUrls = ref('');
const batchLoading = ref(false);
const batchSection = ref('');

// 快速添加卡片相关状态
const showQuickAddModal = ref(false);
const quickAddLoading = ref(false);
const quickAddError = ref('');
const quickAddForm = ref({ url: '', title: '', desc: '', section: '' });
const sectionSuggestions = ref([]);
const editingSection = ref('');
const editingSectionValue = ref('');

async function loadSectionSuggestions() {
  try {
    const res = await getCardSections();
    sectionSuggestions.value = res.data || [];
  } catch {
    sectionSuggestions.value = [];
  }
}

// 分组重命名
function startEditSection(sectionName) {
  editingSection.value = sectionName;
  editingSectionValue.value = sectionName;
  nextTick(() => {
    const input = document.querySelector('.section-rename-input');
    if (input) { input.focus(); input.select(); }
  });
}

async function saveSectionRename(subMenuId) {
  const oldName = editingSection.value;
  const newName = editingSectionValue.value.trim();
  editingSection.value = '';
  if (!newName || newName === oldName) return;

  try {
    await apiInstance.patch('/cards/sections/rename', {
      oldName,
      newName,
      sub_menu_id: subMenuId || null
    });
    showToastMessage(`分组「${oldName}」已重命名为「${newName}」`, 'success');
    await loadCards(true);
  } catch (err) {
    showToastMessage('重命名失败: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// 删除分组（清空卡片的 section 字段，不删除卡片）
function deleteSection(sectionName, subMenuId) {
  requireAuth(async () => {
    if (!confirm(`确定取消分组「${sectionName}」？\n该分组下的卡片不会被删除，仅解除分组归属。`)) return;
    try {
      const { data } = await apiInstance.delete('/cards/sections', {
        data: { name: sectionName, sub_menu_id: subMenuId || null }
      });
      showToastMessage(`已取消分组「${sectionName}」，${data.updated} 张卡片已解除分组`, 'success');
      await loadCards(true);
    } catch (err) {
      showToastMessage('取消分组失败: ' + (err.response?.data?.error || err.message), 'error');
    }
  });
}

// 批量设置分组
const showBatchSectionModal = ref(false);
const batchSectionValue = ref('');
const batchSectionLoading = ref(false);

function openBatchSectionModal() {
  batchSectionValue.value = '';
  showBatchSectionModal.value = true;
  loadSectionSuggestions();
}

async function applyBatchSectionToSelected() {
  if (selectedCards.value.length === 0) return;
  batchSectionLoading.value = true;

  try {
    const section = batchSectionValue.value.trim();
    let successCount = 0;

    for (const card of selectedCards.value) {
      try {
        await updateCard(card.id, {
          menu_id: card.menu_id,
          sub_menu_id: card.sub_menu_id,
          title: card.title,
          url: card.url,
          logo_url: card.logo_url,
          desc: card.desc,
          order: card.order || 0,
          section
        });
        card.section = section;
        successCount++;
      } catch (e) {
        console.warn(`Failed to set section for card ${card.id}:`, e.message);
      }
    }

    showBatchSectionModal.value = false;
    selectedCards.value = [];
    showToastMessage(`已为 ${successCount} 张卡片${section ? '设置分组「' + section + '」' : '清除分组'}`, 'success');
    await loadCards(true);
  } catch (err) {
    showToastMessage('设置分组失败: ' + err.message, 'error');
  } finally {
    batchSectionLoading.value = false;
  }
}
const batchError = ref('');
const parsedCards = ref([]);
const rememberPassword = ref(false);

// 权限验证相关状态（统一的密码验证系统）
const showPasswordModal = ref(false);
const authPassword = ref('');
const authLoading = ref(false);
const authError = ref('');
const authShake = ref(false);
const trustDevice = ref(false);
const showAuthPasswordText = ref(false);
const authPasswordInput = ref(null);
const pendingAction = ref(null); // 待执行的操作回调
const pendingActionResolve = ref(null); // 401 拦截器等待验证完成的 resolve
const pendingActionReject = ref(null); // 401 拦截器等待验证完成的 reject

// 云端备份同步状态
const cloudNeedsSync = ref(false);
// 云备份状态改为按需检测：初始 idle，点击云图标才请求，不再定时弹提醒
const cloudSyncStatus = ref('idle');
const cloudLocalVersion = ref(null);
const cloudRemoteVersion = ref(null);
const showBackupSyncModal = ref(false);
const backupSyncPassword = ref('');
const backupSyncLoading = ref(false);
const backupSyncError = ref('');
const backupSyncSuccess = ref('');

// 检查当前设备是否已信任
const isDeviceTrusted = () => {
  const savedData = localStorage.getItem('nav_password_token');
  if (!savedData) return false;
  try {
    const parsed = JSON.parse(savedData);
    return !!(parsed?.password);
  } catch { return false; }
};

// AI 生成相关状态
const aiGenerating = ref(false);
const aiGeneratingTags = ref(false);
const aiGeneratingName = ref(false);
const aiConfigured = ref(false); // AI 是否已配置
// AI 多候选点选状态：field='title'|'desc'，list=候选数组，loading=生成中
const aiOptions = ref({ field: null, list: [], loading: false });

// 批量移动相关状态
const selectedCards = ref([]);
const showMovePanel = ref(false);
const targetMenuId = ref(null);
const targetSubMenuId = ref(null);
const showGroupSelectMenu = ref(false);

// Toast 提示状态
const toastMessage = ref('');
const showToast = ref(false);

// 操作进度弹窗状态
const showProgressModal = ref(false);
const progressTitle = ref('');
const progressMessage = ref('');
const progressStatus = ref('loading'); // loading, success, error

// 卡片编辑模态框相关状态
const showEditCardModal = ref(false);
const editingCard = ref(null);
const editError = ref('');
const editLoading = ref(false);
const cardEditForm = ref({
  title: '',
  url: '',
  logo_url: '',
  desc: '',
  section: ''
});

// 背景面板
const showBgPanel = ref(false);
const currentBgId = ref(1);

// 内置背景图优先（本地资源，无网络依赖）；其余为可选外链丰富项，加载失败会自动回退本地背景
const presetBackgrounds = [
  { id: 1, name: '内置默认', thumb: '/background.webp', url: '/background.webp' },
  { id: 2, name: '星空银河', thumb: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&h=1080&fit=crop' },
  { id: 3, name: '海边日落', thumb: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop' },
  { id: 4, name: '森林小径', thumb: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=1080&fit=crop' },
  { id: 5, name: '极光之夜', thumb: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&h=1080&fit=crop' },
  { id: 6, name: '雪山倒影', thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&h=1080&fit=crop' },
  { id: 7, name: '樱花盛开', thumb: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&h=1080&fit=crop' },
  { id: 8, name: '沙漠星空', thumb: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&h=1080&fit=crop' },
  { id: 9, name: '湖光山色', thumb: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=1920&h=1080&fit=crop' },
  { id: 10, name: '云端之上', thumb: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&h=1080&fit=crop' },
  { id: 11, name: '秋日红叶', thumb: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=1920&h=1080&fit=crop' },
  { id: 12, name: '瀑布飞流', thumb: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=1920&h=1080&fit=crop' },
  { id: 13, name: '草原晨曦', thumb: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&h=1080&fit=crop' },
  { id: 14, name: '城市夜景', thumb: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1920&h=1080&fit=crop' },
  { id: 15, name: '热带海岛', thumb: 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=300&h=200&fit=crop', url: 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=1920&h=1080&fit=crop' }
];

// 选择背景
function selectBackground(bg) {
  currentBgId.value = bg.id;
  applyBackgroundWithFallback(bg.url);
  saveBgSetting(bg.id);
  showBgPanel.value = false;
}

// 应用背景到页面（外链加载失败时自动回退本地内置背景）
function applyBackgroundWithFallback(url) {
  const fallback = '/background.webp';
  if (!url || url === fallback) {
    applyBackground(fallback);
    return;
  }
  const img = new Image();
  img.onload = () => applyBackground(url);
  img.onerror = () => applyBackground(fallback);
  img.src = url;
}

// 应用背景到页面
function applyBackground(url) {
  let bgStyle = document.getElementById('dynamic-bg-style');
  if (!bgStyle) {
    bgStyle = document.createElement('style');
    bgStyle.id = 'dynamic-bg-style';
    document.head.appendChild(bgStyle);
  }
  bgStyle.textContent = `.home-container { background-image: url(${url}) !important; background-size: cover; background-position: center; background-attachment: fixed; }`;
}

// 保存背景设置到本地
function saveBgSetting(bgId) {
  try {
    localStorage.setItem('nav_bg_id', bgId.toString());
  } catch (e) {
    console.warn('保存背景设置失败:', e);
  }
}

// 加载保存的背景设置
function loadBgSetting() {
  try {
    const savedId = localStorage.getItem('nav_bg_id');
    if (savedId) {
      const bgId = parseInt(savedId);
      const bg = presetBackgrounds.find(b => b.id === bgId);
      if (bg) {
        currentBgId.value = bgId;
        applyBackgroundWithFallback(bg.url);
      }
    }
  } catch (e) {
    console.warn('加载背景设置失败:', e);
  }
}

// 等当前背景图解码完成再放行首屏（无背景/加载失败/超时直接放行）
function waitBackgroundReady(timeout = 1500) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (!done) { done = true; resolve(); }
    };
    try {
      // 未保存选择时页面用的是 preset 1（内置 /background.webp），必须一并等待
      const savedId = parseInt(localStorage.getItem('nav_bg_id') || '1');
      const bg = presetBackgrounds.find(b => b.id === savedId) || presetBackgrounds[0];
      if (!bg || !bg.url) { finish(); return; }
      const timer = setTimeout(finish, timeout);
      const img = new Image();
      img.onload = () => { clearTimeout(timer); finish(); };
      img.onerror = () => { clearTimeout(timer); finish(); };
      img.src = bg.url;
      if (img.complete) { clearTimeout(timer); finish(); }
    } catch {
      finish();
    }
  });
}

const selectedCardsCount = computed(() => {
  return parsedCards.value.filter(card => card.selected).length;
});

// 默认搜索引擎配置
const defaultEngines = [
  // 优先
  {
    name: 'bing',
    label: 'Bing',
    url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
  },
  {
    name: 'google',
    label: 'Google',
    url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  },
  {
    name: 'baidu',
    label: '百度',
    url: q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
  },
  // 国内
  {
    name: '360',
    label: '360搜索',
    url: q => `https://www.so.com/s?q=${encodeURIComponent(q)}`
  },
  {
    name: 'sogou',
    label: '搜狗',
    url: q => `https://www.sogou.com/web?query=${encodeURIComponent(q)}`
  },
  // 其他
  {
    name: 'github',
    label: 'GitHub',
    url: q => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`
  },
  {
    name: 'duckduckgo',
    label: 'DuckDuckGo',
    url: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
  },
  {
    name: 'yahoo',
    label: 'Yahoo',
    url: q => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`
  },
  {
    name: 'yandex',
    label: 'Yandex',
    url: q => `https://yandex.com/search/?text=${encodeURIComponent(q)}`
  }
];

// 初始化时立即设置默认搜索引擎，避免搜索框延迟显示
const searchEngines = ref([...defaultEngines]);
const selectedEngine = ref(defaultEngines[0]);

// 自定义搜索引擎相关状态
const showAddEngineModal = ref(false);
const showEngineDropdown = ref(false);
const engineError = ref('');
const engineLoading = ref(false);
const engineStep = ref(1); // 1:输入URL 2:编辑信息
const engineUrl = ref('');
const newEngine = ref({
  name: '',
  searchUrl: '',
  keyword: ''
});

// 搜索引擎配置版本号（移除图标功能后）
const ENGINE_CONFIG_VERSION = '3.0';


function selectEngine(engine) {
  selectedEngine.value = engine;
  // 保存到 localStorage
  try {
    localStorage.setItem('default_search_engine', engine.name);
  } catch (e) {
    console.error('Failed to save default search engine:', e);
  }
}

// 切换下拉菜单显示
function toggleEngineDropdown() {
  showEngineDropdown.value = !showEngineDropdown.value;
}

// 从下拉菜单选择搜索引擎
function selectEngineFromDropdown(engine) {
  selectEngine(engine);
  showEngineDropdown.value = false;
}

// 保存搜索引擎顺序到localStorage，并同步自定义引擎顺序到后端（跨设备）
function saveEngineOrder() {
  try {
    const order = searchEngines.value.map(e => e.name);
    localStorage.setItem('search_engine_order', JSON.stringify(order));
  } catch (e) {
    console.error('保存搜索引擎顺序失败:', e);
  }
  const customs = searchEngines.value.filter(e => e.custom && e.id);
  if (customs.length > 0) {
    reorderSearchEngines(customs.map(e => ({ id: e.id }))).catch(() => {});
  }
}

// 上移搜索引擎
function moveEngineUp(index) {
  if (index <= 0) return;
  const engines = [...searchEngines.value];
  [engines[index - 1], engines[index]] = [engines[index], engines[index - 1]];
  searchEngines.value = engines;
  saveEngineOrder();
}

// 下移搜索引擎
function moveEngineDown(index) {
  if (index >= searchEngines.value.length - 1) return;
  const engines = [...searchEngines.value];
  [engines[index], engines[index + 1]] = [engines[index + 1], engines[index]];
  searchEngines.value = engines;
  saveEngineOrder();
}

function clearSearch() {
  searchQuery.value = '';
}

// 打开添加搜索引擎弹窗(需要先验证密码)
async function openAddEngineModal() {
  requireAuth(() => {
    showAddEngineModal.value = true;
    engineStep.value = 1;
    engineError.value = '';
    engineUrl.value = '';
    newEngine.value = {
      name: '',
      searchUrl: '',
      keyword: ''
    };
  });
}

// 关闭添加搜索引擎弹窗
function closeAddEngineModal() {
  showAddEngineModal.value = false;
  engineStep.value = 1;
  engineError.value = '';
  engineUrl.value = '';
  showEngineDropdown.value = false;
}

// 解析搜索引擎URL
async function parseEngineUrl() {
  if (!engineUrl.value.trim()) {
    engineError.value = '请输入URL';
    return;
  }
  
  engineLoading.value = true;
  engineError.value = '';
  
  try {
    const res = await parseSearchEngine(engineUrl.value);
    newEngine.value = {
      name: res.data.name,
      searchUrl: res.data.searchUrl,
      keyword: res.data.keyword
    };
    engineStep.value = 2;
  } catch (error) {
    engineError.value = error.response?.data?.error || '解析失败，请检查URL是否正确';
  } finally {
    engineLoading.value = false;
  }
}

// 添加自定义搜索引擎
async function addCustomEngine() {
  if (!newEngine.value.name.trim()) {
    engineError.value = '请输入搜索引擎名称';
    return;
  }
  if (!newEngine.value.searchUrl.trim()) {
    engineError.value = '请输入搜索URL模板';
    return;
  }
  if (!newEngine.value.searchUrl.includes('{searchTerms}')) {
    engineError.value = '搜索URL模板必须包含 {searchTerms} 占位符';
    return;
  }
  
  engineLoading.value = true;
  engineError.value = '';
  
  try {
    const res = await addSearchEngine({
      name: newEngine.value.name,
      search_url: newEngine.value.searchUrl,
      keyword: newEngine.value.keyword
    });
    
    // 添加到前端列表
    const customEngine = {
      name: 'custom_' + res.data.id,
      label: res.data.name,
      icon: '🔎',
      placeholder: `${res.data.name} 搜索...`,
      url: q => res.data.search_url.replace('{searchTerms}', encodeURIComponent(q)),
      custom: true,
      id: res.data.id,
      keyword: res.data.keyword
    };
    searchEngines.value.push(customEngine);
    
    showToastMessage('搜索引擎添加成功', 'success');
    closeAddEngineModal();
  } catch (error) {
    engineError.value = error.response?.data?.error || '添加失败';
  } finally {
    engineLoading.value = false;
  }
}

// 删除自定义搜索引擎
async function deleteCustomEngine(engine) {
  if (!confirm(`确定要删除「${engine.label}」搜索引擎吗？`)) return;

  requireAuth(async () => {
    try {
      await deleteSearchEngine(engine.id);

      // 从列表中移除
      const index = searchEngines.value.findIndex(e => e.name === engine.name);
      if (index > -1) {
        searchEngines.value.splice(index, 1);
      }

      // 如果删除的是当前选中的引擎，切换到第一个
      if (selectedEngine.value.name === engine.name) {
        selectedEngine.value = searchEngines.value[0];
        selectEngine(searchEngines.value[0]);
      }

      showToastMessage('删除成功', 'success');
    } catch (error) {
      alert('删除失败：' + (error.response?.data?.error || error.message));
    }
  });
}

const filteredCards = computed(() => {
  const sourceCards = debouncedSearchQuery.value ? allCards.value : cards.value;
  return filterCardsByActiveCriteria(sourceCards, debouncedSearchQuery.value, true);
});

const globalSortType = ref('time_desc');
const showGlobalSortMenu = ref(false);

// 手动排序（上移/下移）仅在默认排序下有意义；非默认排序时禁用
const canManualSort = computed(() => globalSortType.value === 'default');

const sortOptions = [
  { type: 'default', label: '默认', icon: '📌' },
  { type: 'time', label: '时间', icon: '🕐' },
  { type: 'freq', label: '频率', icon: '🔥' },
  { type: 'name', label: '名称', icon: '🔤' }
];

function getSortLabel(value) {
  if (value === 'default') return '默认';
  const type = value.replace(/_asc|_desc/, '');
  const isDesc = value.endsWith('_desc');
  const option = sortOptions.find(o => o.type === type);
  return option ? `${option.label} ${isDesc ? '↓' : '↑'}` : '排序';
}

function getSortDirection(type) {
  if (globalSortType.value.startsWith(type)) {
    return globalSortType.value.endsWith('_desc') ? 'desc' : 'asc';
  }
  return null;
}

function toggleGlobalSortMenu() {
  showGlobalSortMenu.value = !showGlobalSortMenu.value;
}

  async function selectGlobalSort(type) {
    // 显式切回默认排序（手动排序的唯一入口）
    if (type === 'default') {
      globalSortType.value = 'default';
      try {
        await fetch('/api/cards/user-settings/sort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortType: 'default' })
        });
      } catch (e) {
        console.error('保存排序设置失败:', e);
      }
      return;
    }

    const currentType = globalSortType.value.replace(/_asc|_desc/, '');
    const currentDir = globalSortType.value.endsWith('_desc') ? 'desc' : 'asc';
    
    let newValue;
    if (currentType === type) {
      if (currentDir === 'desc') {
        newValue = `${type}_asc`;
      } else {
        // 升序再点一次回到默认排序，避免无法退出规则排序
        newValue = 'default';
      }
    } else {
      newValue = `${type}_desc`;
    }
    
    globalSortType.value = newValue;
    // 不关闭菜单，让用户看到切换效果，或者根据体验决定是否关闭
    // showGlobalSortMenu.value = false; 
    
    try {
      await fetch('/api/cards/user-settings/sort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortType: newValue })
      });
    } catch (e) {
      console.error('保存排序设置失败:', e);
    }
  }

async function initGlobalSort() {
  try {
    const res = await fetch('/api/cards/user-settings/sort');
    const data = await res.json();
    if (data.sortType) {
      globalSortType.value = data.sortType;
    }
  } catch (e) {
    console.error('获取排序设置失败:', e);
  }
}

// 分组显示的卡片（主菜单下的卡片 + 各子菜单下的卡片）
// 重新设计：基于 cards.value 进行分组，而不是依赖 cardsCache
const groupedCards = computed(() => {
  if (!activeMenu.value || activeSubMenu.value || searchQuery.value) {
    return [];
  }
  
  const groups = [];
  const subMenus = activeMenu.value.subMenus || [];
  const currentCards = cards.value || [];
  
  // 创建子菜单ID到子菜单的映射
  const subMenuMap = new Map();
  subMenus.forEach(sub => subMenuMap.set(sub.id, sub));
  
  // 按子菜单ID分组卡片
  const cardsBySubMenu = new Map();
  cardsBySubMenu.set(null, []); // 主菜单下的卡片（没有子菜单的）
  subMenus.forEach(sub => cardsBySubMenu.set(sub.id, []));
  
  // 将卡片分配到对应的分组
    currentCards.forEach(card => {
      const subMenuId = card.sub_menu_id || null;
    if (cardsBySubMenu.has(subMenuId)) {
      cardsBySubMenu.get(subMenuId).push(card);
    } else {
      // 如果子菜单不存在，放到主菜单下
      cardsBySubMenu.get(null).push(card);
    }
  });
  
  // 1. 首先添加直接在主菜单下的卡片（没有子菜单的）
  const mainCards = cardsBySubMenu.get(null) || [];
  if (mainCards.length > 0) {
    groups.push({
      key: 'main',
      name: null, // 主菜单下的卡片不显示标题
      subMenuId: null,
      cards: mainCards
    });
  }
  
  // 2. 按子菜单顺序添加各子菜单的卡片
  for (const subMenu of subMenus) {
    const subCards = cardsBySubMenu.get(subMenu.id) || [];
    if (subCards.length > 0) {
      groups.push({
        key: `sub_${subMenu.id}`,
        name: subMenu.name,
        subMenuId: subMenu.id,
        cards: subCards
      });
    }
  }
  
  return groups;
});

onMounted(async () => {
  // 迁移旧格式信任凭据（带 expiry 的旧数据）
  migrateOldTokenFormat();

  // 注册全局 401 认证挑战回调
  setAuthChallengeHandler(() => {
    return new Promise((resolve, reject) => {
      pendingActionResolve.value = resolve;
      pendingActionReject.value = reject;
      showAuthModal(null);
    });
  });

  // 加载保存的背景设置
  loadBgSetting();

  // ========== 第一步：优先从缓存恢复数据（零网络等待，秒开）==========
  const CACHE_KEY = 'nav_data_cache';
  const CARDS_CACHE_KEY = 'nav_cards_cache';

  let cacheUsed = false;
  let cachedCardsMap = {};

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (data.menus?.length) {
        menus.value = data.menus;
        isFrequentView.value = true;
        cacheUsed = true;
      }
      if (data.cards) cards.value = data.cards;
      loadFrequentCardsFromCache();
      if (data.promos) {
        leftPromos.value = data.promos.filter(item => item.position === 'left');
        rightPromos.value = data.promos.filter(item => item.position === 'right');
      }
      if (data.friends) friendLinks.value = data.friends;
      if (data.engines) {
        const customEngines = data.engines.map(engine => ({
          name: 'custom_' + engine.id,
          label: engine.name,
          iconUrl: null,
          iconFallback: '🔎',
          placeholder: `${engine.name} 搜索...`,
          url: q => engine.search_url.replace('{searchTerms}', encodeURIComponent(q)),
          custom: true,
          id: engine.id,
          keyword: engine.keyword
        }));
        searchEngines.value = [...defaultEngines, ...customEngines];
      }
      const savedOrder = localStorage.getItem('search_engine_order');
      if (savedOrder) {
        try {
          const order = JSON.parse(savedOrder);
          const engineMap = new Map(searchEngines.value.map(e => [e.name, e]));
          const sorted = [];
          order.forEach(name => {
            if (engineMap.has(name)) { sorted.push(engineMap.get(name)); engineMap.delete(name); }
          });
          engineMap.forEach(e => sorted.push(e));
          if (sorted.length > 0) searchEngines.value = sorted;
        } catch (e) {}
      }
      const savedEngineName = localStorage.getItem('default_search_engine');
      if (savedEngineName) {
        const foundEngine = searchEngines.value.find(e => e.name === savedEngineName);
        if (foundEngine) selectedEngine.value = foundEngine;
      }
    }
    const cardsCacheStr = localStorage.getItem(CARDS_CACHE_KEY);
    if (cardsCacheStr) {
      // 缓存不设过期：立即渲染，网络结果回来后覆盖（stale-while-revalidate）
      const { data: cardsData } = JSON.parse(cardsCacheStr);
      cachedCardsMap = cardsData || {};
      cardsCache.value = cachedCardsMap;
      if (menus.value.length > 0) {
        const firstMenu = menus.value[0];
        // 缓存卡片按第一个菜单加载，选中菜单同步为第一个，保证首屏一致
        activeMenu.value = firstMenu;
        activeSubMenu.value = null;
        const allCachedCards = [];
        const firstMenuKey = `${firstMenu.id}_null`;
        if (cachedCardsMap[firstMenuKey]) allCachedCards.push(...cachedCardsMap[firstMenuKey]);
        if (firstMenu.subMenus && firstMenu.subMenus.length) {
          for (const subMenu of firstMenu.subMenus) {
            const subKey = `${firstMenu.id}_${subMenu.id}`;
            if (cachedCardsMap[subKey]) allCachedCards.push(...cachedCardsMap[subKey]);
          }
        }
        if (allCachedCards.length > 0) cards.value = allCachedCards;
      }
    }
  } catch (e) {}

  // 有缓存：渲染完成 + 背景图解码完成即通知外层撤遮罩（不等网络）
  if (cacheUsed) {
    nextTick(() => {
      waitBackgroundReady().then(() => {
        window.dispatchEvent(new Event('navora:content-ready'));
      });
    });
  }

  // 无缓存时立即显示骨架屏，避免空白闪烁
  if (!cacheUsed && frequentCards.value.length === 0) {
    isFrequentLoading.value = true;
  }

  // ========== 第二步：一次性并行发起所有网络请求（互不阻塞）==========
  initGlobalSort().catch(() => {});
  syncExpandedGroupsFromServer().finally(() => { _skipServerSync = false; });
  checkAIConfig();

  const cacheData = { menus: null, cards: null, tags: null, ads: null, friends: null, engines: null };

  // 全部请求同时发起——菜单、常用卡片、全量卡片、宣传/友链/引擎
  getAllCards(true).then(res => {
    const { cardsByCategory } = res.data;
    if (cardsByCategory) {
      Object.assign(cardsCache.value, cardsByCategory);
      saveCardsCache();
      allCards.value = Object.values(cardsByCategory).flat();
    }
  }).catch(() => {});

  loadDeferredHomeData(cacheData).catch(() => {});

  // 仅等待菜单和常用卡片（核心内容），全量卡片不阻塞
  const [menusRes] = await Promise.all([
    Promise.resolve(getMenus()).then(
      value => ({ status: 'fulfilled', value }),
      reason => ({ status: 'rejected', reason })
    ),
    loadFrequentCards().catch(() => {})
  ]);

  if (menusRes.status === 'fulfilled') {
    menus.value = menusRes.value.data;
    cacheData.menus = menusRes.value.data;
    // 立即落盘：loadDeferredHomeData 可能先于菜单返回就写缓存，这里补写保证菜单一定入缓存
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: cacheData, timestamp: Date.now() }));
    } catch (e) {}
    if (menus.value.length) {
      // 无缓存时默认进入第一个菜单，避免新用户首屏停在"常用"空状态
      if (!cacheUsed && !activeMenu.value) {
        activeMenu.value = menus.value[0];
        activeSubMenu.value = null;
        await loadCards(false).catch(() => {});
      }
      cacheData.cards = cards.value;
    }
  }

  // 无缓存：菜单和常用卡片回来后（已渲染）再通知外层撤遮罩
  if (!cacheUsed) {
    nextTick(() => {
      waitBackgroundReady().then(() => {
        window.dispatchEvent(new Event('navora:content-ready'));
      });
    });
  }
  
  // 获取并保存数据版本号
  try {
    const versionRes = await getDataVersion();
    saveDataVersion(versionRes.data.version);
  } catch (e) {
    console.error('获取数据版本号失败:', e);
  }

  // 从 localStorage 初始化默认搜索引擎
  try {
    const savedVersion = localStorage.getItem('engine_config_version');
    if (savedVersion !== ENGINE_CONFIG_VERSION) {
      // 清除所有搜索引擎相关缓存
      localStorage.removeItem('default_search_engine');
      localStorage.removeItem('search_engines'); // 清除可能存在的旧缓存
      localStorage.setItem('engine_config_version', ENGINE_CONFIG_VERSION);
    }

    const savedEngineName = localStorage.getItem('default_search_engine');
    let engineToSelect = searchEngines.value[0];
    if (savedEngineName) {
      const foundEngine = searchEngines.value.find(e => e.name === savedEngineName);
      if (foundEngine) {
        engineToSelect = foundEngine;
      }
    }
    selectEngine(engineToSelect);
  } catch (e) {
    console.error('Failed to set default search engine:', e);
    if (searchEngines.value.length > 0) {
      selectEngine(searchEngines.value[0]);
    }
  }
  
  // 检查是否有保存的密码token
  checkSavedPassword();
  
  // 检查 URL 参数，看是否需要自动打开批量添加
  const urlParams = new URLSearchParams(window.location.search);
  const batchAddParam = urlParams.get('batchAdd');
  const urlsParam = urlParams.get('urls');
  
  if (batchAddParam === 'true' && urlsParam) {
    // 清理 URL 参数，避免刷新时重复执行
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // 稍微延迟一下，确保菜单已经加载
    setTimeout(() => {
      // 自动打开批量添加弹窗
      openBatchAddModal();
      
      // 再等待一下，确保弹窗已打开且已跳过密码验证步骤
      setTimeout(() => {
        // 如果已经在第二步，则自动填充 URLs
        if (batchStep.value === 2) {
          batchUrls.value = decodeURIComponent(urlsParam);
        } else {
          // 如果还在第一步，等待用户验证后填充
          const checkAndFill = setInterval(() => {
            if (batchStep.value === 2) {
              batchUrls.value = decodeURIComponent(urlsParam);
              clearInterval(checkAndFill);
            }
          }, 100);
          
          // 最多等待 30 秒
          setTimeout(() => clearInterval(checkAndFill), 30000);
        }
      }, 300);
    }, 500);
  }
  
  document.addEventListener('click', closeEngineDropdown);
  document.addEventListener('click', closeSortMenu);
  document.addEventListener('keydown', handleGlobalKeydown);
});

// 全局键盘事件处理（ESC关闭弹窗 + / 聚焦搜索）
function handleGlobalKeydown(e) {
  // / 快捷键聚焦搜索框（输入中不拦截）
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = e.target?.tagName;
    if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      return;
    }
  }
  if (e.key === 'Escape') {
    if (showPasswordModal.value) {
      closePasswordModal();
    } else if (showBatchAddModal.value) {
      closeBatchAdd();
    } else if (showEditCardModal.value) {
      closeEditCardModal();
    } else if (showMenuModal.value) {
      showMenuModal.value = false;
    } else if (showAddEngineModal.value) {
      closeAddEngineModal();
    }
  }
}

function closeSortMenu() {
  showGlobalSortMenu.value = false;
}


// 数据版本号（用于缓存同步）
const DATA_VERSION_KEY = 'nav_data_version';
let cachedDataVersion = parseInt(localStorage.getItem(DATA_VERSION_KEY) || '0');

// 保存数据版本号
function saveDataVersion(version) {
  cachedDataVersion = version;
  localStorage.setItem(DATA_VERSION_KEY, String(version));
}

// SSE连接（实时接收数据版本变更）
let isRefreshing = false;
let deferredDataTimer = null;
let deferredSearchTimer = null;
let frequentRefreshTimer = null;
let frequentRefreshDebounceTimer = null;

async function loadDeferredHomeData(cacheData) {
  const [promosRes, friendsRes, enginesRes] = await Promise.allSettled([
    getPromos(),
    getFriends(),
    getSearchEngines()
  ]);

  if (promosRes.status === 'fulfilled') {
    leftPromos.value = promosRes.value.data.filter(item => item.position === 'left');
    rightPromos.value = promosRes.value.data.filter(item => item.position === 'right');
    cacheData.promos = promosRes.value.data;
  }

  if (friendsRes.status === 'fulfilled') {
    friendLinks.value = friendsRes.value.data;
    cacheData.friends = friendsRes.value.data;
  }

  if (enginesRes.status === 'fulfilled') {
    const customEngines = enginesRes.value.data.map(engine => ({
      name: 'custom_' + engine.id,
      label: engine.name,
      iconUrl: null,
      iconFallback: '🔎',
      placeholder: `${engine.name} 搜索...`,
      url: q => engine.search_url.replace('{searchTerms}', encodeURIComponent(q)),
      custom: true,
      id: engine.id,
      keyword: engine.keyword
    }));
    searchEngines.value = [...defaultEngines, ...customEngines];
    cacheData.engines = enginesRes.value.data;
  } else {
    console.error('加载自定义搜索引擎失败:', enginesRes.reason);
    searchEngines.value = [...defaultEngines];
  }

  try {
    if (cacheData.menus) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: cacheData,
        timestamp: Date.now()
      }));
    }
  } catch (e) {
    // 缓存保存失败，忽略（可能是存储空间不足）
  }
}

// 处理数据版本变更
async function handleVersionChange(newVersion, senderId = null) {
  // 如果只是相同版本，直接跳过
  if (newVersion === cachedDataVersion) {
    if (newVersion !== cachedDataVersion) {
      saveDataVersion(newVersion);
    }
    return;
  }
  
  if (isRefreshing) return;
  
  isRefreshing = true;
  
  try {
    // 保存当前显示的数据（避免刷新时闪烁）
    const currentCards = cards.value;
    const currentMenuId = activeMenu.value?.id;
    const currentSubMenuId = activeSubMenu.value?.id;
    
    // 刷新菜单数据
    const menusRes = await getMenus(true);
    const newMenus = menusRes.data;
    menus.value = newMenus;
    
    // 尝试恢复之前选中的菜单
    if (currentMenuId) {
      const restoredMenu = newMenus.find(m => m.id === currentMenuId);
      if (restoredMenu) {
        activeMenu.value = restoredMenu;
        // 如果之前选中了子菜单，尝试恢复
        if (currentSubMenuId && restoredMenu.subMenus) {
          const restoredSubMenu = restoredMenu.subMenus.find(s => s.id === currentSubMenuId);
          activeSubMenu.value = restoredSubMenu || null;
        }
      } else {
        // 菜单被删除，切换到第一个
        activeMenu.value = newMenus[0] || null;
        activeSubMenu.value = null;
      }
    }
    
    // 刷新当前显示的卡片
    await loadCards(true);
    
    // 清除其他分类的缓存（后台静默清除）
    setTimeout(() => {
      const currentKey = getCardsCacheKey(
        activeMenu.value?.id, 
        activeSubMenu.value?.id || null
      );
      Object.keys(cardsCache.value).forEach(key => {
        if (key !== currentKey) {
          delete cardsCache.value[key];
        }
      });
      saveCardsCache();
    }, 100);
    
    // 更新本地版本号
    saveDataVersion(newVersion);
  } catch (error) {
    // 刷新失败，静默处理
  } finally {
    isRefreshing = false;
  }
}

// SSE 统一走组合式函数：无限重连 + 重连版本对账
useDataSync('Home', ({ version }) => {
  handleVersionChange(version);
});

onUnmounted(() => {
  document.removeEventListener('click', closeEngineDropdown);
  document.removeEventListener('keydown', handleGlobalKeydown);
  
  if (deferredDataTimer) {
    clearTimeout(deferredDataTimer);
  }
  if (deferredSearchTimer) {
    clearTimeout(deferredSearchTimer);
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  stopFrequentPolling();
  if (frequentRefreshDebounceTimer) {
    clearTimeout(frequentRefreshDebounceTimer);
    frequentRefreshDebounceTimer = null;
  }
});

// 获取友情链接 logo（与首页卡片完全一致）
// 关闭搜索引擎下拉菜单
function closeEngineDropdown() {
  if (showEngineDropdown.value) {
    showEngineDropdown.value = false;
  }
}

// 处理容器点击事件（关闭下拉菜单、清除选择）
function handleContainerClick(event) {
  closeEngineDropdown();
  if (showGlobalSortMenu.value) {
    showGlobalSortMenu.value = false;
  }
  if (event && event.target && event.target.classList && event.target.classList.contains('home-container') && selectedCards.value.length > 0) {
    clearSelection();
  }
}

  function handleCardClicked(cardId) {
    // 1. 更新当前显示的卡片列表（触发即时重排）
    const cardInView = cards.value.find(c => c.id === cardId);
    if (cardInView) {
      cardInView.click_count = (cardInView.click_count || 0) + 1;
      cards.value = [...cards.value];
    }
    
    // 2. 更新 allCards（用于搜索结果）
    const cardInAll = allCards.value.find(c => c.id === cardId);
    if (cardInAll) {
      cardInAll.click_count = (cardInAll.click_count || 0) + 1;
    }
    
    // 3. 更新缓存中的数据
    for (const key of Object.keys(cardsCache.value)) {
      const cachedCards = cardsCache.value[key];
      const card = cachedCards.find(c => c.id === cardId);
      if (card) {
        if (!cardInView) {
          card.click_count = (card.click_count || 0) + 1;
        }
        break;
      }
    }
    saveCardsCache();
    
    // 4. 延迟刷新常用列表，使点击的卡片能动态排序
    if (isFrequentView.value) {
      // 本地先提升该卡片的排序权重（临时优化视觉反馈）
      const freqCard = frequentCards.value.find(c => c.id === cardId);
      if (freqCard) {
        freqCard.click_count = (freqCard.click_count || 0) + 1;
      }
      debouncedRefreshFrequent();
    }
  }

async function selectMenu(menu, parentMenu = null) {
  isFrequentView.value = false;
  stopFrequentPolling();
  if (parentMenu) {
    activeMenu.value = parentMenu;
    activeSubMenu.value = menu;
  } else {
    activeMenu.value = menu;
    activeSubMenu.value = null;
  }
  
  const forceRefresh = needForceRefresh.value;
  if (forceRefresh) {
    needForceRefresh.value = false;
  }
  
  await loadCards(forceRefresh);
  initGlobalSort();
  
  preloadAdjacentCategories();
}

// 切换到常用视图
async function handleSelectFrequent() {
  isFrequentView.value = true;
  activeMenu.value = null;
  activeSubMenu.value = null;
  searchQuery.value = '';
  await loadFrequentCards();
  startFrequentPolling();
}

// 常用卡片缓存
const FREQUENT_CACHE_KEY = 'nav_frequent_cache';

// 从缓存加载常用卡片
function loadFrequentCardsFromCache() {
  try {
    const cached = localStorage.getItem(FREQUENT_CACHE_KEY);
    if (cached) {
      const { data } = JSON.parse(cached);
      // 不设过期：先渲染缓存，loadFrequentCards 的网络结果随后覆盖
      if (Array.isArray(data) && data.length > 0) {
        frequentCards.value = data;
        return true;
      }
    }
  } catch (e) { }
  return false;
}

// 加载常用卡片
async function loadFrequentCards() {
  isFrequentLoading.value = true;
  try {
    const { data } = await getFrequentCards(20, true);
    frequentCards.value = data;
    // 写入缓存，下次秒开
    try {
      localStorage.setItem(FREQUENT_CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) { }
  } catch (err) {
    console.warn('加载常用卡片失败:', err);
    if (frequentCards.value.length === 0) {
      loadFrequentCardsFromCache();
    }
  } finally {
    isFrequentLoading.value = false;
  }
}

// 防抖刷新常用卡片（点击后延迟 2s 再刷新，避免频繁请求）
function debouncedRefreshFrequent() {
  if (frequentRefreshDebounceTimer) {
    clearTimeout(frequentRefreshDebounceTimer);
  }
  frequentRefreshDebounceTimer = setTimeout(() => {
    if (isFrequentView.value) {
      loadFrequentCards();
    }
  }, 2000);
}

// 启动常用轮询（每 30 秒自动刷新）
function startFrequentPolling() {
  stopFrequentPolling();
  frequentRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && isFrequentView.value) {
      loadFrequentCards();
    }
  }, 30000);
}

function stopFrequentPolling() {
  if (frequentRefreshTimer) {
    clearInterval(frequentRefreshTimer);
    frequentRefreshTimer = null;
  }
}

function handleDrawerMenuSelect(menu) {
  isFrequentView.value = false;
  stopFrequentPolling();
  activeMenu.value = menu;
  activeSubMenu.value = null;
  loadCards();
}

function handleDrawerSubMenuSelect(subMenu, parentMenu) {
  isFrequentView.value = false;
  activeMenu.value = parentMenu;
  activeSubMenu.value = subMenu;
  loadCards();
}

function toggleGroupCollapse(groupKey) {
  ensureCollapseBaseline();
  const newSet = new Set(expandedGroups.value);
  if (expandedGroups.value.has(groupKey)) {
    newSet.delete(groupKey);
  } else {
    newSet.add(groupKey);
  }
  expandedGroups.value = newSet;
  localStorage.setItem('expandedGroups', JSON.stringify([...newSet]));
}

// 用户首次执行折叠操作时，把当前视图中所有可见分组标记为"展开"，作为基线。
// 这样第一次折叠某个组不会连带把其他组全部折叠。
function ensureCollapseBaseline() {
  if (hasExpandedPreference.value) return;
  const base = new Set(expandedGroups.value);
  groupedCards.value.forEach(g => base.add(g.key));
  groupBySection(sortedFilteredCards.value).forEach(sec => {
    if (sec.section) base.add(getSectionKey(sec.section, activeSubMenu.value?.id || null));
  });
  expandedGroups.value = base;
  hasExpandedPreference.value = true;
}

function isGroupCollapsed(groupKey) {
  if (!hasExpandedPreference.value) return false;
  return !expandedGroups.value.has(groupKey);
}

function getSectionKey(sectionName, subMenuId) {
  return `sec_${subMenuId || 'main'}_${sectionName}`;
}

function toggleSectionCollapse(sectionName, subMenuId) {
  ensureCollapseBaseline();
  const key = getSectionKey(sectionName, subMenuId);
  const newSet = new Set(expandedGroups.value);
  if (expandedGroups.value.has(key)) {
    newSet.delete(key);
  } else {
    newSet.add(key);
  }
  expandedGroups.value = newSet;
  localStorage.setItem('expandedGroups', JSON.stringify([...newSet]));
}

function isSectionCollapsed(sectionName, subMenuId) {
  if (!hasExpandedPreference.value) return false;
  return !expandedGroups.value.has(getSectionKey(sectionName, subMenuId));
}

let expandedGroupsSaveTimer = null;
function saveExpandedGroupsToServer() {
  if (expandedGroupsSaveTimer) clearTimeout(expandedGroupsSaveTimer);
  expandedGroupsSaveTimer = setTimeout(() => {
    const data = JSON.stringify([...expandedGroups.value]);
    localStorage.setItem('expandedGroups', data);
    fetch('/api/cards/user-settings/expanded-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expandedGroups: data })
    }).catch(() => {});
  }, 500);
}

async function syncExpandedGroupsFromServer() {
  try {
    const res = await fetch('/api/cards/user-settings/expanded-groups');
    const data = await res.json();
    if (data.expandedGroups) {
      const parsed = JSON.parse(data.expandedGroups);
      if (Array.isArray(parsed) && parsed.length > 0) {
        expandedGroups.value = new Set(parsed);
        hasExpandedPreference.value = true;
        localStorage.setItem('expandedGroups', data.expandedGroups);
      }
    }
  } catch (e) {}
}

// 预加载相邻分类的卡片
function preloadAdjacentCategories() {
  if (!activeMenu.value || menus.value.length === 0 || document.visibilityState === 'hidden') return;
  
  const currentIndex = menus.value.findIndex(m => m.id === activeMenu.value.id);
  const toPreload = [];
  
  // 预加载前后各1个分类
  [-1, 1].forEach(offset => {
    const idx = currentIndex + offset;
    if (idx >= 0 && idx < menus.value.length) {
      const menu = menus.value[idx];
      const key = getCardsCacheKey(menu.id, null);
      if (!cardsCache.value[key]) {
        toPreload.push({ menuId: menu.id, subMenuId: null, key });
      }
    }
  });
  
  // 后台静默预加载（不阻塞UI）
  toPreload.forEach(({ menuId, subMenuId, key }) => {
    getCards(menuId, subMenuId)
      .then(res => {
        cardsCache.value[key] = res.data;
        saveCardsCache();
      })
      .catch(() => {});
  });
}

// 加载所有分类的卡片（编辑模式用）
const allCategoryCards = ref({});

// 分类卡片缓存
const cardsCache = ref({});
const CARDS_CACHE_KEY = 'nav_cards_cache';
const CARDS_CACHE_TTL = 5 * 60 * 1000;

// 获取缓存key
function getCardsCacheKey(menuId, subMenuId) {
  return `${menuId}_${subMenuId || 'null'}`;
}

// 保存卡片缓存到localStorage
function saveCardsCache() {
  try {
    localStorage.setItem(CARDS_CACHE_KEY, JSON.stringify({
      data: cardsCache.value,
      timestamp: Date.now()
    }));
  } catch (e) {
    // 存储失败忽略
  }
}

async function loadCards(forceRefresh = false) {
  if (!activeMenu.value) return;
  
  // 如果选择了子菜单，只加载该子菜单的卡片
  if (activeSubMenu.value) {
    const cacheKey = getCardsCacheKey(activeMenu.value.id, activeSubMenu.value.id);
    
    // 如果有缓存直接使用，不请求后端
    if (!forceRefresh && cardsCache.value[cacheKey]) {
      cards.value = cardsCache.value[cacheKey];
      return;
    }
    
    // 优先显示缓存（如果有）
    if (!forceRefresh && cardsCache.value[cacheKey]) {
      cards.value = cardsCache.value[cacheKey];
    }
    
    // 从服务器获取最新数据（始终绕过浏览器HTTP缓存）
    try {
      const res = await getCards(activeMenu.value.id, activeSubMenu.value.id, true);
      cards.value = res.data;
      cardsCache.value[cacheKey] = res.data;
      saveCardsCache();
    } catch (error) {
      console.error('加载卡片失败:', error);
      if (!cardsCache.value[cacheKey]) {
        cards.value = [];
      }
    }
  } else {
    // 选择主菜单时，加载该主菜单下所有卡片（包括直接挂在主菜单下的和所有子菜单的）
    const subMenus = activeMenu.value.subMenus || [];
    const mainCacheKey = getCardsCacheKey(activeMenu.value.id, null);
    
      // 检查是否所有分类都有缓存
      if (!forceRefresh) {
        const cachedCards = [];
        let allCached = true;
        
        // 检查主菜单缓存
        if (cardsCache.value.hasOwnProperty(mainCacheKey)) {
          cachedCards.push(...(cardsCache.value[mainCacheKey] || []));
        } else {
          allCached = false;
        }
        
        // 检查子菜单缓存
        for (const subMenu of subMenus) {
          const subCacheKey = getCardsCacheKey(activeMenu.value.id, subMenu.id);
          if (cardsCache.value.hasOwnProperty(subCacheKey)) {
            cachedCards.push(...(cardsCache.value[subCacheKey] || []));
          } else {
            allCached = false;
          }
        }
        
        // 如果所有分类都有缓存，直接使用缓存（包括空数组）
        if (allCached) {
          cards.value = cachedCards;
          return;
        }
      }
      
      // 1. 先立即显示所有缓存的卡片
      if (!forceRefresh) {
        const cachedCards = [];
        if (cardsCache.value[mainCacheKey]) {
          cachedCards.push(...cardsCache.value[mainCacheKey]);
        }
        subMenus.forEach(subMenu => {
          const subCacheKey = getCardsCacheKey(activeMenu.value.id, subMenu.id);
          if (cardsCache.value[subCacheKey]) {
            cachedCards.push(...cardsCache.value[subCacheKey]);
          }
        });
        cards.value = cachedCards;
      }
    
      // 2. 后台并行加载所有数据，每个请求返回后立即更新显示
      const allPromises = [];
      const allKeys = [];
      const currentMenuId = activeMenu.value.id;
      
      // 实时更新卡片显示的函数
      const updateCardsDisplay = () => {
        if (activeMenu.value?.id !== currentMenuId) return;
        const allCardsInMenu = [];
        if (cardsCache.value[mainCacheKey]) {
          allCardsInMenu.push(...cardsCache.value[mainCacheKey]);
        }
        subMenus.forEach(subMenu => {
          const subCacheKey = getCardsCacheKey(currentMenuId, subMenu.id);
          if (cardsCache.value[subCacheKey]) {
            allCardsInMenu.push(...cardsCache.value[subCacheKey]);
          }
        });
        if (allCardsInMenu.length > 0) {
          cards.value = allCardsInMenu;
        }
      };
      
      // 主菜单请求（直接挂在主菜单下的卡片）
      allKeys.push(mainCacheKey);
      allPromises.push(
        getCards(activeMenu.value.id, null, true)
          .then(res => {
            cardsCache.value[mainCacheKey] = res.data;
            updateCardsDisplay();
            return res.data;
          })
          .catch(error => {
            console.error('加载主菜单卡片失败:', error);
            return cardsCache.value[mainCacheKey] || [];
          })
      );
      
      // 所有子菜单请求（并行），每个请求返回后立即更新显示
      subMenus.forEach(subMenu => {
        const subCacheKey = getCardsCacheKey(activeMenu.value.id, subMenu.id);
        allKeys.push(subCacheKey);
        allPromises.push(
          getCards(activeMenu.value.id, subMenu.id, true)
            .then(res => {
              cardsCache.value[subCacheKey] = res.data;
              updateCardsDisplay();
              return res.data;
            })
            .catch(error => {
              console.error(`加载子菜单 ${subMenu.name} 卡片失败:`, error);
              return cardsCache.value[subCacheKey] || [];
            })
      );
    });
      
      // 等待所有请求完成，保存缓存
      await Promise.all(allPromises);
      saveCardsCache();
    }
  }

// 加载所有卡片用于搜索（优化版：单次请求获取所有数据）
async function loadAllCardsForSearch() {
  try {
    const res = await getAllCards();
    const { cardsByCategory } = res.data;
    
    // 更新缓存
    Object.assign(cardsCache.value, cardsByCategory);
    saveCardsCache();
    
    // 合并所有卡片用于搜索
    allCards.value = Object.values(cardsByCategory).flat();
  } catch (error) {
    console.error('批量加载卡片失败，回退到逐个加载:', error);
    // 回退到逐个加载
    const promises = [];
    const keys = [];
    
    for (const menu of menus.value) {
      const key = getCardsCacheKey(menu.id, null);
      keys.push(key);
      promises.push(
        getCards(menu.id, null)
          .then(res => res.data)
          .catch(() => cardsCache.value[key] || [])
      );
      
      if (menu.subMenus && menu.subMenus.length) {
        for (const subMenu of menu.subMenus) {
          const subKey = getCardsCacheKey(menu.id, subMenu.id);
          keys.push(subKey);
          promises.push(
            getCards(menu.id, subMenu.id)
              .then(res => res.data)
              .catch(() => cardsCache.value[subKey] || [])
          );
        }
      }
    }
    
    const results = await Promise.all(promises);
    results.forEach((data, index) => {
      if (data && data.length > 0) {
        cardsCache.value[keys[index]] = data;
      }
    });
    saveCardsCache();
    allCards.value = results.flat();
  }
}

// 加载所有分类的卡片（优化版：并行加载）
async function loadAllCards() {
  const promises = [];
  const keys = [];
  
  for (const menu of menus.value) {
    const key = `${menu.id}_null`;
    keys.push(key);
    promises.push(
      getCards(menu.id, null)
        .then(res => res.data)
        .catch(() => [])
    );
    
    // 并行加载子分类
    if (menu.subMenus && menu.subMenus.length) {
      for (const subMenu of menu.subMenus) {
        const subKey = `${menu.id}_${subMenu.id}`;
        keys.push(subKey);
        promises.push(
          getCards(menu.id, subMenu.id)
            .then(res => res.data)
            .catch(() => [])
        );
      }
    }
  }
  
  const results = await Promise.all(promises);
  const tempCards = {};
  results.forEach((cards, index) => {
    tempCards[keys[index]] = cards;
  });
  allCategoryCards.value = tempCards;
}

// 根据分类ID获取卡片
function getCategoryCards(menuId, subMenuId) {
  const key = `${menuId}_${subMenuId}`;
  return allCategoryCards.value[key] || [];
}

function handleSearch() {
  const keyword = searchQuery.value.trim();
  if (!keyword) return;

  // 显式搜索：回车/搜索按钮恒等于用当前引擎打开外网搜索，不再被站内卡片截获
  const url = selectedEngine.value.url(keyword);
  window.open(url, '_blank');
  searchQuery.value = '';
}

function syncCurrentCardLists(mutator) {
  cards.value = mutator(Array.isArray(cards.value) ? [...cards.value] : []);
  allCards.value = mutator(Array.isArray(allCards.value) ? [...allCards.value] : []);

  Object.keys(allCategoryCards.value).forEach(key => {
    allCategoryCards.value[key] = mutator(Array.isArray(allCategoryCards.value[key]) ? [...allCategoryCards.value[key]] : []);
  });

  Object.keys(cardsCache.value).forEach(key => {
    cardsCache.value[key] = mutator(Array.isArray(cardsCache.value[key]) ? [...cardsCache.value[key]] : []);
  });

  saveCardsCache();
}

function syncCardCollectionsAfterChange({ updatedCard = null, deletedCardId = null, addedCards = [], menuId = null, subMenuId = null }) {
  const targetMenuId = menuId ?? activeMenu.value?.id ?? null;
  const targetSubMenuId = subMenuId ?? activeSubMenu.value?.id ?? null;
  const cacheKey = targetMenuId ? getCardsCacheKey(targetMenuId, targetSubMenuId) : null;

  const applyCardUpdate = (list) => {
    if (!Array.isArray(list)) return list;

    let next = list;

    if (deletedCardId !== null) {
      next = next.filter(card => card.id !== deletedCardId);
    }

    if (updatedCard) {
      next = next.map(card => card.id === updatedCard.id ? { ...card, ...updatedCard } : card);
    }

    if (addedCards.length > 0) {
      const existingIds = new Set(next.map(card => card.id));
      const newCards = addedCards.filter(card => !existingIds.has(card.id));
      next = [...newCards, ...next];
    }

    return next;
  };

  cards.value = applyCardUpdate(cards.value);
  allCards.value = applyCardUpdate(allCards.value);

  Object.keys(allCategoryCards.value).forEach(key => {
    allCategoryCards.value[key] = applyCardUpdate(allCategoryCards.value[key]);
  });

  if (cacheKey && cardsCache.value[cacheKey]) {
    cardsCache.value[cacheKey] = applyCardUpdate(cardsCache.value[cacheKey]);
  }

  if (targetMenuId && !targetSubMenuId) {
    const mainKey = getCardsCacheKey(targetMenuId, null);
    if (cardsCache.value[mainKey]) {
      cardsCache.value[mainKey] = applyCardUpdate(cardsCache.value[mainKey]);
    }
  }

  saveCardsCache();
}

// 获取搜索引擎图标
function getEngineIcon(engine) {
  if (engine.iconUrl) return engine.iconUrl;
  try {
    const origin = new URL(engine.url('')).origin;
    return `/icons/${new URL(origin).hostname}`;
  } catch {
    return '/default-favicon.png';
  }
}

// 处理搜索引擎图标错误
function handleEngineIconError(event) {
  event.target.src = '/default-favicon.png';
}

// 批量添加相关函数
// 打开批量添加弹窗，检查是否有有效的token
async function openBatchAddModal() {
  showBatchAddModal.value = true;
  batchError.value = '';

  // 检查是否有信任设备的保存密码
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (parsed.password) {
        // 信任设备，尝试用保存的token验证
        if (parsed.token) {
          localStorage.setItem('token', parsed.token);
        }
        try {
          await verifyToken();
          // token有效，恢复并跳到第二步
          batchPassword.value = parsed.password;
          rememberPassword.value = true;
          batchStep.value = 2;
          return;
        } catch (e) {
          // token无效，尝试用保存的密码重新获取
          try {
            const res = await verifyPassword(parsed.password);
            localStorage.setItem('token', res.data.token);
            batchPassword.value = parsed.password;
            rememberPassword.value = true;
            batchStep.value = 2;
            return;
          } catch (e2) {
            // 密码也失效了，清除
            localStorage.removeItem('token');
            localStorage.removeItem('nav_password_token');
          }
        }
      }
    } catch (e) {
      localStorage.removeItem('nav_password_token');
    }
  }

  // 没有有效token，显示密码验证步骤
  batchStep.value = 1;
}

function closeBatchAdd() {
  showBatchAddModal.value = false;
  batchStep.value = 1;
  batchPassword.value = '';
  batchUrls.value = '';
  batchError.value = '';
  batchSection.value = '';
  parsedCards.value = [];
  batchLoading.value = false;
}

// 快速添加卡片
function openQuickAddModal() {
  requireAuth(() => {
    quickAddForm.value = { url: '', title: '', desc: '', section: '' };
    quickAddError.value = '';
    showQuickAddModal.value = true;
    loadSectionSuggestions();
  });
}

async function saveQuickAdd() {
  const url = quickAddForm.value.url.trim();
  if (!url) {
    quickAddError.value = '请输入网址';
    return;
  }

  quickAddLoading.value = true;
  quickAddError.value = '';

  try {
    const menuId = activeMenu.value?.id;
    const subMenuId = activeSubMenu.value?.id || null;

    if (!menuId) {
      quickAddError.value = '请先选择一个菜单分类';
      quickAddLoading.value = false;
      return;
    }

    await addCard({
      menu_id: menuId,
      sub_menu_id: subMenuId,
      title: quickAddForm.value.title.trim() || url,
      url: url,
      logo_url: '',
      desc: quickAddForm.value.desc.trim(),
      section: quickAddForm.value.section.trim()
    });

    showQuickAddModal.value = false;
    showToastMessage('卡片添加成功', 'success');

    // 重新加载卡片
    await loadCards(true);

    // 如果标题为空，触发 AI 自动生成
    if (!quickAddForm.value.title.trim()) {
      const allCardsList = cards.value || [];
      const newCard = allCardsList.find(c => c.url === url);
      if (newCard) {
        autoGenerateAIForNewCards([newCard.id]);
      }
    }
  } catch (err) {
    quickAddError.value = err.response?.data?.error || err.message || '添加失败';
  } finally {
    quickAddLoading.value = false;
  }
}

// 检查保存的密码（信任设备模式）
function checkSavedPassword() {
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (parsed.password) {
        // 信任设备：恢复密码和token
        batchPassword.value = parsed.password;
        rememberPassword.value = true;
        if (parsed.token) {
          localStorage.setItem('token', parsed.token);
        }
      }
    } catch (e) {
      localStorage.removeItem('nav_password_token');
    }
  }
}

async function verifyBatchPassword() {
  if (!batchPassword.value) {
    batchError.value = '请输入密码';
    return;
  }
  
  batchLoading.value = true;
  batchError.value = '';
  
  try {
    // 仅使用密码验证，不需要用户名
    const response = await verifyPassword(batchPassword.value);
    
    // 检查并保存 token
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token);
    } else {
      throw new Error('验证成功，但未收到 token');
    }
    
    // 如果选择了信任此设备，保存密码（不设过期时间）
    if (rememberPassword.value) {
      localStorage.setItem('nav_password_token', JSON.stringify({
        password: batchPassword.value
      }));
      localStorage.setItem('nav_trust_device', 'true');
    }

    batchStep.value = 2;
  } catch (error) {
    batchError.value = '密码错误，请重试';
    console.error('密码验证失败:', error);
  } finally {
    batchLoading.value = false;
  }
}

// 返回密码验证步骤（清除保存的token）
function handleBackToPassword() {
  // 清除保存的token，要求重新验证
  localStorage.removeItem('nav_password_token');
  localStorage.removeItem('token');
  batchPassword.value = '';
  rememberPassword.value = false;
  batchStep.value = 1;
}

async function parseUrls() {
  const urls = batchUrls.value
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);
  
  if (urls.length === 0) {
    batchError.value = '请输入至少一个网址';
    return;
  }
  
  batchLoading.value = true;
  batchError.value = '';
  
  try {
    // 1. 解析 URL
    const response = await batchParseUrls(urls);
    
    // 2. 获取全站现有卡片，用于重复检测，和最终提交规则保持一致
    const existingCardsRes = await getAllCards(true);
    const existingCards = Object.values(existingCardsRes.data?.cardsByCategory || {}).flat();
    
    // 3. 检测重复并标记
    parsedCards.value = response.data.data.map(card => {
      // 检测与现有卡片重复
      let duplicateCard = null;
      let duplicateMatch = null;
      for (const existing of existingCards) {
        const match = getDuplicateMatch({ title: card.title, url: card.url }, existing);
        if (match) {
          if (match.type === 'similar' && match.reason === '主域名相同但路径不同' && isMultiPathDomainAllowed(card.url)) {
            continue;
          }
          duplicateCard = existing;
          duplicateMatch = match;
          if (match.type === 'exact') break;
        }
      }
      
      const isDuplicate = duplicateMatch?.type === 'exact';
      const isSimilar = duplicateMatch?.type === 'similar';
      
      return {
        ...card,
        selected: !isDuplicate, // 只有精确重复的默认不选中，同站不同页默认允许继续添加
        isDuplicate: isDuplicate,
        isSimilarDuplicate: isSimilar,
        duplicateReason: duplicateMatch?.reason || '',
        duplicateOf: duplicateCard ? {
          id: duplicateCard.id,
          title: duplicateCard.title,
          url: duplicateCard.url,
          path: extractPathname(duplicateCard.url),
          urlPreview: formatUrlPreview(duplicateCard.url)
        } : null,
        currentPath: extractPathname(card.url),
        urlPreview: formatUrlPreview(card.url)
      };
    });
    
    batchStep.value = 3;
  } catch (error) {
    batchError.value = error.response?.data?.error || '解析失败，请重试';
  } finally {
    batchLoading.value = false;
  }
}

function applyBatchSection() {
  const sec = batchSection.value.trim();
  parsedCards.value.forEach(card => {
    if (card.selected) card.section = sec;
  });
}

async function addSelectedCards() {
  const selected = parsedCards.value.filter(card => card.selected);

  if (selected.length === 0) {
    batchError.value = '请至少选择一个网站';
    return;
  }

  batchLoading.value = true;
  batchError.value = '';

  try {
    const cardsToAdd = selected.map(card => ({
      title: card.title,
      url: card.url,
      logo: card.logo,
      description: card.description,
      section: card.section || ''
    }));
    
    const response = await batchAddCards(
      activeMenu.value.id,
      activeSubMenu.value?.id || null,
      cardsToAdd
    );
    
    // 构建结果消息
    const added = response.data.added || 0;
    const skipped = response.data.skipped || 0;
    const skippedCards = response.data.skippedCards || [];
    const addedCardIds = response.data.ids || [];
    
    let message = '';
    
    if (added > 0 && skipped === 0) {
      // 全部成功
      message = `✅ 成功添加 ${added} 个网站！`;
    } else if (added > 0 && skipped > 0) {
      // 部分成功
      message = `✅ 成功添加 ${added} 个网站\n\u26a0️ 跳过 ${skipped} 个重复的网站\n\n重复的网站：\n${skippedCards.map((card, i) => `${i + 1}. ${card.title} (${card.reason})`).join('\n')}`;
    } else {
      // 全部跳过
      message = `\u26a0️ 所有网站都是重复的，未添加任何卡片\n\n重复的网站：\n${skippedCards.map((card, i) => `${i + 1}. ${card.title}\n   与现有卡片“${card.duplicateOf?.title || ''}”重复`).join('\n')}`;
    }
    
    alert(message);
    
    // 关闭弹窗并强制刷新卡片列表（不使用缓存）
    closeBatchAdd();
    syncCurrentCardLists(list => list);
    await loadCards(true);
    
    // 如果有新添加的卡片，检查是否需要自动 AI 生成
    if (addedCardIds && addedCardIds.length > 0) {
      await autoGenerateAIForNewCards(addedCardIds);
    }
  } catch (error) {
    batchError.value = error.response?.data?.error || '添加失败，请重试';
  } finally {
    batchLoading.value = false;
  }
}

// 自动为新添加的卡片生成 AI 描述和标签
async function autoGenerateAIForNewCards(cardIds) {
  try {
    // 检查 AI 配置是否启用自动生成
    const configRes = await api.get('/api/ai/config');
    if (!configRes.data.success || !configRes.data.config.autoGenerate) {
      return; // 未启用自动生成
    }
    
    if (!configRes.data.config.hasApiKey) {
      return; // 未配置 API Key
    }
    
    // 显示进度提示
    showToastMessage('🤖 AI 正在自动生成名称和描述...', 'info', 0);

    const delay = configRes.data.config.requestDelay || 1500;
    let successCount = 0;
    
    for (let i = 0; i < cardIds.length; i++) {
      const cardId = cardIds[i];
      
      try {
        // 获取卡片信息
        const cardInfo = cards.value.find(c => c.id === cardId) || 
                         allCards.value.find(c => c.id === cardId);
        
        if (!cardInfo) continue;
        
        // 使用 'all' 类型一次性生成名称、描述和标签
        const genRes = await api.post('/api/ai/generate', {
          type: 'all',
          card: { 
            title: cardInfo.title, 
            url: cardInfo.url,
            desc: cardInfo.desc || ''
          },
          existingTags
        });
        
        if (genRes.data.success) {
          // 更新名称和描述
          const updates = {};
          if (genRes.data.name) updates.title = genRes.data.name;
          if (genRes.data.description) updates.desc = genRes.data.description;
          
          if (Object.keys(updates).length > 0) {
            await api.put(`/api/cards/${cardId}`, updates);
          }

          successCount++;
        }
        
        // 延迟，避免触发限流
        if (i < cardIds.length - 1) {
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (e) {
        console.warn(`AI 生成失败 (卡片 ${cardId}):`, e);
      }
    }
    
    // 刷新卡片列表以显示新生成的内容
    if (successCount > 0) {
      await loadCards(true);
      await loadAllTags();
      showToastMessage(`✨ AI 已为 ${successCount} 个卡片生成名称、描述和标签`, 'success');
    } else {
      showToastMessage('', 'info', 0); // 清除提示
    }
  } catch (e) {
    console.warn('自动 AI 生成失败:', e);
    showToastMessage('', 'info', 0); // 清除提示
  }
}

// ========== 权限验证系统 ==========

// 迁移旧格式（带 expiry）的信任凭据到新格式（无过期）
function migrateOldTokenFormat() {
  const savedData = localStorage.getItem('nav_password_token');
  if (!savedData) return;
  try {
    const parsed = JSON.parse(savedData);
    if (parsed.password && parsed.expiry !== undefined) {
      // 旧格式有 expiry 字段，迁移为新格式
      if (Date.now() < parsed.expiry) {
        // 未过期的旧凭据，保留密码，去掉 expiry/token/duration
        const newData = { password: parsed.password };
        localStorage.setItem('nav_password_token', JSON.stringify(newData));
        if (parsed.token) localStorage.setItem('token', parsed.token);
      } else {
        // 已过期的旧凭据，清除
        localStorage.removeItem('nav_password_token');
        localStorage.removeItem('token');
      }
    }
  } catch {
    localStorage.removeItem('nav_password_token');
  }
}

// 检查本地是否有token（信任设备时自动恢复 token）
function hasLocalToken() {
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (parsed.password) {
        // 信任设备：如果有保存的 token，恢复到 localStorage.token
        const token = localStorage.getItem('token');
        if (!token && parsed.token) {
          localStorage.setItem('token', parsed.token);
        }
        return !!localStorage.getItem('token');
      }
    } catch { /* ignore */ }
  }
  return !!localStorage.getItem('token');
}

// 处理token无效错误
function handleTokenInvalid() {
  localStorage.removeItem('token');
  localStorage.removeItem('nav_password_token');
  authError.value = 'Token已失效，请重新输入管理密码';
}

// 显示密码验证弹窗
function showAuthModal(action) {
  pendingAction.value = action;
  showPasswordModal.value = true;
  authPassword.value = '';
  authError.value = '';
  authShake.value = false;
  showAuthPasswordText.value = false;

  // 恢复信任设备偏好
  const savedTrust = localStorage.getItem('nav_trust_device');
  trustDevice.value = savedTrust === 'true';

  const savedAuth = getSavedPasswordToken();
  if (savedAuth) {
    authPassword.value = savedAuth.password;
    trustDevice.value = true;
  }

  // 自动聚焦密码输入框
  nextTick(() => {
    if (authPasswordInput.value) {
      authPasswordInput.value.focus();
      const length = authPassword.value?.length || 0;
      authPasswordInput.value.setSelectionRange?.(length, length);
    }
  });
}

// 获取已保存的信任设备密码
function getSavedPasswordToken() {
  const savedData = localStorage.getItem('nav_password_token');
  if (!savedData) return null;

  try {
    const parsed = JSON.parse(savedData);
    if (!parsed?.password) return null;
    return parsed;
  } catch (error) {
    localStorage.removeItem('nav_password_token');
    return null;
  }
}

async function tryRestoreAuthFromSavedPassword() {
  const savedAuth = getSavedPasswordToken();
  if (!savedAuth) return false;

  try {
    const res = await verifyPassword(savedAuth.password);
    localStorage.setItem('token', res.data.token);
    return true;
  } catch (error) {
    localStorage.removeItem('nav_password_token');
    return false;
  }
}

// 需要验证权限后执行操作（异步验证token有效性）
async function requireAuth(action) {
  if (!hasLocalToken()) {
    if (await tryRestoreAuthFromSavedPassword()) {
      action();
      return;
    }
    showAuthModal(action);
    return;
  }
  
  // 有本地token时，先向后端验证token是否有效
  try {
    await verifyToken();
    // token有效，直接执行操作
    action();
  } catch (error) {
    // token无效时，优先尝试用记住的密码静默续签
    if (await tryRestoreAuthFromSavedPassword()) {
      action();
      return;
    }
    // token无效，清除本地token并显示密码弹窗
    handleTokenInvalid();
    showAuthModal(action);
  }
}

// 关闭密码验证弹窗
function closePasswordModal() {
  showPasswordModal.value = false;
  authPassword.value = '';
  authError.value = '';
  authShake.value = false;
  showAuthPasswordText.value = false;
  pendingAction.value = null;
  // 通知 401 拦截器：用户取消了验证
  if (pendingActionReject.value) {
    const reject = pendingActionReject.value;
    pendingActionResolve.value = null;
    pendingActionReject.value = null;
    reject(new Error('用户取消验证'));
  }
}

// 取消信任此设备
function revokeTrust() {
  if (!confirm('取消信任此设备后，后续操作需要重新输入管理密码验证。确定取消？')) return;
  localStorage.removeItem('nav_password_token');
  localStorage.removeItem('nav_trust_device');
  localStorage.removeItem('token');
  showToastMessage('已取消信任此设备', 'success');
}

// 版本检测
async function checkCloudVersion() {
  try {
    const res = await checkWebdavVersion();
    const data = res.data || {};
    cloudSyncStatus.value = data.status || 'unknown';
    cloudNeedsSync.value = data.needsSync === true;
    cloudLocalVersion.value = data.localVersion ?? null;
    cloudRemoteVersion.value = data.cloudVersion ?? null;
  } catch (e) {
    cloudNeedsSync.value = false;
    cloudSyncStatus.value = 'error';
    cloudLocalVersion.value = null;
    cloudRemoteVersion.value = null;
  }
}

const cloudSyncIndicatorClass = computed(() => {
  if (cloudSyncStatus.value === 'synced') return 'is-green';
  if (['idle', 'checking', 'not_configured', 'auth_required'].includes(cloudSyncStatus.value)) return 'is-neutral';
  return 'is-red';
});

const cloudSyncIndicatorTitle = computed(() => {
  if (cloudSyncStatus.value === 'idle') {
    return '点击检查云端备份版本';
  }
  if (cloudSyncStatus.value === 'synced') {
    return `云端备份已同步（本地 ${cloudLocalVersion.value ?? '-'} / 云端 ${cloudRemoteVersion.value ?? '-'}）`;
  }
  if (cloudSyncStatus.value === 'outdated') {
    return `云端备份落后于本地（本地 ${cloudLocalVersion.value ?? '-'} / 云端 ${cloudRemoteVersion.value ?? '-'}），点击手动云备份`;
  }
  if (cloudSyncStatus.value === 'missing_cloud_backup') {
    return '云端还没有版本记录，点击手动云备份';
  }
  if (cloudSyncStatus.value === 'not_configured') {
    return '尚未配置 WebDAV';
  }
  if (cloudSyncStatus.value === 'cloud_ahead') {
    return `云端版本高于本地（本地 ${cloudLocalVersion.value ?? '-'} / 云端 ${cloudRemoteVersion.value ?? '-'}）`;
  }
  return '云端版本状态检测失败';
});

async function handleCloudStatusClick() {
  if (cloudSyncStatus.value === 'idle' || cloudSyncStatus.value === 'error') {
    cloudSyncStatus.value = 'checking';
    await checkCloudVersion();
  }
  if (cloudSyncStatus.value === 'outdated' || cloudSyncStatus.value === 'missing_cloud_backup') {
    showBackupSyncModal.value = true;
    return;
  }
  if (cloudSyncStatus.value === 'synced') {
    showToastMessage('云端备份已是最新', 'success');
    return;
  }
  if (cloudSyncStatus.value === 'not_configured') {
    showToastMessage('请先在后台配置 WebDAV', 'info');
    return;
  }
  if (cloudSyncStatus.value === 'cloud_ahead') {
    showToastMessage('云端版本高于本地，请确认是否需要先恢复云备份', 'info', 3500);
    return;
  }
  showToastMessage('云端版本检测失败，请稍后重试', 'error');
}

// 同步备份到云端
async function handleBackupSync() {
  if (!backupSyncPassword.value) {
    backupSyncError.value = '请输入密码';
    return;
  }
  backupSyncLoading.value = true;
  backupSyncError.value = '';
  backupSyncSuccess.value = '';
  try {
    const authRes = await verifyPassword(backupSyncPassword.value);
    localStorage.setItem('token', authRes.data.token);
    await api.post('/api/backup/webdav/backup', {});
    backupSyncSuccess.value = '云备份同步成功！';
    await checkCloudVersion();
    if (!cloudNeedsSync.value) {
      setTimeout(() => { showBackupSyncModal.value = false; }, 1500);
    }
  } catch (error) {
    backupSyncError.value = error.response?.data?.message || '同步失败，请检查密码或网络';
  } finally {
    backupSyncLoading.value = false;
  }
}

// 验证密码
async function verifyAuthPassword() {
  if (!authPassword.value) {
    authError.value = '请输入密码';
    return;
  }

  authLoading.value = true;
  authError.value = '';

  try {
    const res = await verifyPassword(authPassword.value);
    localStorage.setItem('token', res.data.token);

    // 信任此设备：保存密码，不设过期时间
    if (trustDevice.value) {
      localStorage.setItem('nav_password_token', JSON.stringify({
        password: authPassword.value
      }));
      localStorage.setItem('nav_trust_device', 'true');
    } else {
      localStorage.removeItem('nav_password_token');
      localStorage.removeItem('nav_trust_device');
    }

    showPasswordModal.value = false;
    authLoading.value = false;
    showAuthPasswordText.value = false;

    // 通知 401 拦截器：验证已完成
    if (pendingActionResolve.value) {
      const resolve = pendingActionResolve.value;
      pendingActionResolve.value = null;
      pendingActionReject.value = null;
      resolve();
    }

    if (pendingAction.value) {
      const action = pendingAction.value;
      pendingAction.value = null;
      action();
    }
    } catch (error) {
        authError.value = '密码错误，请重新输入';
        authLoading.value = false;
        // 触发抖动动画
        authShake.value = true;
        setTimeout(() => {
          authShake.value = false;
        }, 400);
      }
}

function handleContextEdit(card) {
  requireAuth(() => handleEditCard(card));
}

function handleContextDelete(card) {
  if (isFrequentView.value) {
    handleRemoveFromFrequent(card);
  } else {
    requireAuth(() => handleDeleteCard(card));
  }
}

function handleRequireAuth(callback) {
  requireAuth(callback);
}

function handleToggleCardSelection(card) {
  toggleCardSelection(card);
}

// 卡片上移/下移（手动排序，基于当前视图显示顺序）
async function handleMoveCard(card, direction) {
  requireAuth(async () => {
    const scope = locateCardDisplayList(card);
    if (!scope) return;

    const idx = scope.findIndex(c => c.id === card.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= scope.length) return;

    // 交换相邻卡片
    const tmp = scope[idx];
    scope[idx] = scope[swapIdx];
    scope[swapIdx] = tmp;

    // 重编号整个列表并提交（batch-update 仅更新 id/order/menu_id/sub_menu_id）
    const updates = scope.map((c, i) => ({
      id: c.id,
      order: i,
      menu_id: c.menu_id ?? c.parent_menu_id ?? null,
      sub_menu_id: c.sub_menu_id ?? null
    }));

    try {
      await batchUpdateCards(updates);
      // 本地即时生效
      scope.forEach((c, i) => { c.order = i; });
      showToastMessage(direction === 'up' ? '已上移' : '已下移', 'success');
      await loadCards(true);
    } catch (err) {
      showToastMessage('排序保存失败: ' + (err.response?.data?.error || err.message), 'error');
      await loadCards(true); // 回滚到服务端顺序
    }
  });
}

// 定位卡片在当前视图中的显示顺序列表
function locateCardDisplayList(card) {
  if (isFrequentView.value && !isSearchActive.value) {
    return frequentCards.value;
  }
  if (activeSubMenu.value || isSearchActive.value) {
    return sortedFilteredCards.value;
  }
  for (const group of groupedCards.value) {
    const display = sortAndFilterCards(group.cards, group.subMenuId);
    if (display.some(c => c.id === card.id)) {
      return display;
    }
  }
  return null;
}

// 打开移动面板
function openMovePanel() {
  requireAuth(() => {
    showMovePanel.value = true;
    targetMenuId.value = activeMenu.value?.id || null;
    targetSubMenuId.value = activeSubMenu.value?.id || null;
  });
}

// 批量删除选中的卡片
async function batchDeleteSelected() {
  if (selectedCards.value.length === 0) return;
  
  const count = selectedCards.value.length;
  if (!confirm(`确定要删除选中的 ${count} 个卡片吗？`)) return;
  
  requireAuth(async () => {
    showProgress('批量删除', `正在删除 ${count} 个卡片...`);
    
    try {
      let successCount = 0;
      for (const card of selectedCards.value) {
        try {
          await deleteCard(card.id);
          successCount++;
        } catch (e) {
          failedCards.push(card.title);
        }
      }
      
        clearAllCardsCache();
        await loadCards(true);
        clearSelection();
        updateProgress(`成功删除 ${successCount} 个卡片`, 'success');
    } catch (error) {
      updateProgress('删除失败：' + (error.message || '未知错误'), 'error');
    }
    });
}

// ========== 菜单管理（带权限验证）==========
const showMenuModal = ref(false);
const menuModalMode = ref('add');
const menuModalType = ref('menu');
const editingMenuData = ref({ id: null, name: '', parentId: null, afterId: null, afterSubMenuId: null });
const menuModalLoading = ref(false);

const menuInsertHint = computed(() => {
  if (menuModalType.value === 'menu') {
    if (editingMenuData.value.afterId) {
      const targetMenu = menus.value.find(m => m.id === editingMenuData.value.afterId);
      return targetMenu
        ? `新主菜单会插入到「${targetMenu.name}」后面`
        : '未选中主菜单时，默认追加到末尾';
    }
    return '未选中主菜单时，默认追加到末尾';
  }

  const parentMenu = menus.value.find(m => m.id === editingMenuData.value.parentId);
  if (editingMenuData.value.afterSubMenuId && parentMenu?.subMenus) {
    const targetSubMenu = parentMenu.subMenus.find(s => s.id === editingMenuData.value.afterSubMenuId);
    return targetSubMenu
      ? `新子菜单会插入到「${targetSubMenu.name}」后面`
      : '未选中子菜单时，默认追加到当前主菜单末尾';
  }
  return '未选中子菜单时，默认追加到当前主菜单末尾';
});

function refreshActiveMenuState() {
  if (!activeMenu.value) return;

  const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
  if (!updatedActiveMenu) return;

  activeMenu.value = updatedActiveMenu;
  if (activeSubMenu.value) {
    const updatedSubMenu = updatedActiveMenu.subMenus?.find(s => s.id === activeSubMenu.value.id);
    activeSubMenu.value = updatedSubMenu || null;
  }
}

function selectInsertedMenuItem(newMenuId, parentId, newSubMenuId) {
  if (newMenuId) {
    const insertedMenu = menus.value.find(m => m.id === newMenuId);
    if (insertedMenu) {
      activeMenu.value = insertedMenu;
      activeSubMenu.value = null;
    }
    return;
  }

  if (newSubMenuId && parentId) {
    const insertedParentMenu = menus.value.find(m => m.id === parentId);
    const insertedSubMenu = insertedParentMenu?.subMenus?.find(s => s.id === newSubMenuId);
    if (insertedParentMenu && insertedSubMenu) {
      activeMenu.value = insertedParentMenu;
      activeSubMenu.value = insertedSubMenu;
    }
  }
}

function buildMenuCreatePayload(name, afterId) {
  const maxOrder = menus.value.length > 0 ? Math.max(...menus.value.map(m => m.order || 0)) : 0;
  return { name, order: maxOrder + 1, afterId };
}

function buildSubMenuCreatePayload(parentId, name, afterSubMenuId) {
  const parentMenu = menus.value.find(m => m.id === parentId);
  const subMenus = parentMenu?.subMenus || [];
  const maxOrder = subMenus.length > 0 ? Math.max(...subMenus.map(s => s.order || 0)) : 0;
  return { name, order: maxOrder + 1, afterSubMenuId };
}

function handleAddMenu(referenceMenu = null) {
  requireAuth(() => openAddMenuModal(referenceMenu));
}

function handleEditMenu(menu) {
  requireAuth(() => openEditMenuModal(menu));
}

function handleAddSubMenu(parentMenu) {
  requireAuth(() => openAddSubMenuModal(parentMenu));
}

function handleEditSubMenu(subMenu, parentMenu) {
  requireAuth(() => openEditSubMenuModal(subMenu, parentMenu));
}

function handleDeleteMenuWithAuth(menu) {
  requireAuth(() => handleDeleteMenu(menu));
}

function handleDeleteSubMenuWithAuth(subMenu, parentMenu) {
  requireAuth(() => handleDeleteSubMenu(subMenu, parentMenu));
}

function openAddMenuModal(referenceMenu = null) {
  const targetMenu = referenceMenu || activeMenu.value || null;
  menuModalMode.value = 'add';
  menuModalType.value = 'menu';
  editingMenuData.value = {
    id: null,
    name: '',
    parentId: null,
    afterId: targetMenu?.id || null,
    afterSubMenuId: null
  };
  showMenuModal.value = true;
}

function openEditMenuModal(menu) {
  menuModalMode.value = 'edit';
  menuModalType.value = 'menu';
  editingMenuData.value = { id: menu.id, name: menu.name, parentId: null, afterId: null, afterSubMenuId: null };
  showMenuModal.value = true;
}

function openAddSubMenuModal(parentMenu) {
  menuModalMode.value = 'add';
  menuModalType.value = 'subMenu';
  editingMenuData.value = {
    id: null,
    name: '',
    parentId: parentMenu.id,
    afterId: null,
    afterSubMenuId: activeMenu.value?.id === parentMenu.id ? activeSubMenu.value?.id || null : null
  };
  showMenuModal.value = true;
}

function openEditSubMenuModal(subMenu, parentMenu) {
  menuModalMode.value = 'edit';
  menuModalType.value = 'subMenu';
  editingMenuData.value = { id: subMenu.id, name: subMenu.name, parentId: parentMenu.id, afterId: null, afterSubMenuId: null };
  showMenuModal.value = true;
}

// 保存菜单
async function saveMenuModal() {
  const name = editingMenuData.value.name.trim();
  if (!name) {
    alert('请输入名称');
    return;
  }
  
  const mode = menuModalMode.value;
  const type = menuModalType.value;
  const id = editingMenuData.value.id;
  const parentId = editingMenuData.value.parentId;
  const afterId = editingMenuData.value.afterId;
  const afterSubMenuId = editingMenuData.value.afterSubMenuId;
  
  // 乐观更新：立即在界面上显示变化
  const originalMenus = [...menus.value];
  if (mode === 'edit') {
    if (type === 'menu') {
      const menu = menus.value.find(m => m.id === id);
      if (menu) menu.name = name;
    } else {
      const parent = menus.value.find(m => m.id === parentId);
      if (parent && parent.subMenus) {
        const sub = parent.subMenus.find(s => s.id === id);
        if (sub) sub.name = name;
      }
    }
  }
  
  menuModalLoading.value = true;
  showMenuModal.value = false; // 立即关闭弹窗，提升体验
  
  try {
    let newMenuId = null;
    let newSubMenuId = null;
    
    if (type === 'menu') {
      if (mode === 'add') {
        const res = await addMenu(buildMenuCreatePayload(name, afterId));
        newMenuId = res.data?.id;
      } else {
        await updateMenu(id, { name });
      }
    } else {
      if (mode === 'add') {
        const res = await addSubMenu(parentId, buildSubMenuCreatePayload(parentId, name, afterSubMenuId));
        newSubMenuId = res.data?.id;
      } else {
        await updateSubMenu(id, { name });
      }
    }
    
    // 获取最新数据并同步状态
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    refreshActiveMenuState();
    
    // 初始化新分类的缓存
    if (newMenuId) {
      const cacheKey = getCardsCacheKey(newMenuId, null);
      cardsCache.value[cacheKey] = [];
    }
    if (newSubMenuId) {
      const cacheKey = getCardsCacheKey(parentId, newSubMenuId);
      cardsCache.value[cacheKey] = [];
    }
    selectInsertedMenuItem(newMenuId, parentId, newSubMenuId);
    saveCardsCache();
    
    notifyExtensionRefreshMenus();
  } catch (error) {
    // 失败时回滚
    menus.value = originalMenus;
    alert('操作失败：' + (error.response?.data?.error || error.message));
  } finally {
    menuModalLoading.value = false;
  }
}

// 通知浏览器扩展刷新右键菜单分类
function notifyExtensionRefreshMenus() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
    }
  } catch (e) {
  }
}

// 删除菜单
async function handleDeleteMenu(menu) {
  const cardCount = menu.subMenus?.reduce((sum, sub) => sum + (sub.cardCount || 0), 0) || 0;
  const msg = cardCount > 0 
    ? `确定要删除菜单「${menu.name}」吗？\n该菜单下有 ${cardCount} 张卡片将被一并删除！`
    : `确定要删除菜单「${menu.name}」吗？`;
  
  if (!confirm(msg)) return;
  
  // 乐观更新
  const originalMenus = [...menus.value];
  menus.value = menus.value.filter(m => m.id !== menu.id);
  
  // 如果删除的是当前选中的菜单，预先切换到第一个
  let wasActive = false;
  if (activeMenu.value?.id === menu.id) {
    wasActive = true;
    activeMenu.value = menus.value[0] || null;
    activeSubMenu.value = null;
  }
  
  try {
    await deleteMenu(menu.id);
    
    // 获取最新数据并同步状态
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    
    if (activeMenu.value) {
      const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
      if (updatedActiveMenu) {
        activeMenu.value = updatedActiveMenu;
      }
    }
    
    if (wasActive) {
      await loadCards(true);
    }
    
    notifyExtensionRefreshMenus();
  } catch (error) {
    // 失败时回滚
    menus.value = originalMenus;
    if (wasActive) {
      activeMenu.value = menu;
    }

    alert('删除失败：' + (error.response?.data?.error || error.message));
  }
}

// 删除子菜单
async function handleDeleteSubMenu(subMenu, parentMenu) {
  if (!confirm(`确定要删除子菜单「${subMenu.name}」吗？`)) return;
  
  // 乐观更新
  const originalMenus = JSON.parse(JSON.stringify(menus.value));
  const parent = menus.value.find(m => m.id === parentMenu.id);
  if (parent && parent.subMenus) {
    parent.subMenus = parent.subMenus.filter(s => s.id !== subMenu.id);
  }
  
  // 如果删除的是当前选中的子菜单，预先切换到父菜单
  let wasActive = false;
  if (activeSubMenu.value?.id === subMenu.id) {
    wasActive = true;
    activeSubMenu.value = null;
  }
  
  try {
    await deleteSubMenu(subMenu.id);
    
    // 获取最新数据并同步状态
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    
    if (activeMenu.value) {
      const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
      if (updatedActiveMenu) {
        activeMenu.value = updatedActiveMenu;
      }
    }
    
    if (wasActive) {
      await loadCards(true);
    }
    
    notifyExtensionRefreshMenus();
  } catch (error) {
    // 失败时回滚
    menus.value = originalMenus;
    if (wasActive) {
      activeSubMenu.value = subMenu;
    }
    
    alert('删除失败：' + (error.response?.data?.error || error.message));
  }
}

// 处理菜单拖拽排序
async function handleMenusReordered(menuIds) {
  try {
    // 批量更新菜单顺序
    const updates = menuIds.map((id, index) => updateMenu(id, { order: index }));
    await Promise.all(updates);
    
    // 刷新菜单数据
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    
    // 更新 activeMenu 的引用
    if (activeMenu.value) {
      const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
      if (updatedActiveMenu) {
        activeMenu.value = updatedActiveMenu;
      }
    }
  } catch (error) {
    alert('排序失败：' + (error.response?.data?.error || error.message));
    // 刷新恢复原顺序
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
  }
}

// 处理子菜单上移
async function handleMoveSubMenuUp(subMenu, parentMenu, index) {
  if (index <= 0) return;
  
  const subMenus = parentMenu.subMenus;
  const prevSubMenu = subMenus[index - 1];
  
  try {
    // 交换两个子菜单的 order
    await Promise.all([
      updateSubMenu(subMenu.id, { order: index - 1 }),
      updateSubMenu(prevSubMenu.id, { order: index })
    ]);
    
    // 刷新菜单数据
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    
    // 更新 activeMenu 的引用，确保 subMenus 是最新的
    if (activeMenu.value) {
      const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
      if (updatedActiveMenu) {
        activeMenu.value = updatedActiveMenu;
      }
    }
  } catch (error) {
    alert('排序失败：' + (error.response?.data?.error || error.message));
  }
}

// 处理子菜单下移
async function handleMoveSubMenuDown(subMenu, parentMenu, index) {
  const subMenus = parentMenu.subMenus;
  if (index >= subMenus.length - 1) return;
  
  const nextSubMenu = subMenus[index + 1];
  
  try {
    // 交换两个子菜单的 order
    await Promise.all([
      updateSubMenu(subMenu.id, { order: index + 1 }),
      updateSubMenu(nextSubMenu.id, { order: index })
    ]);
    
    // 刷新菜单数据
    const menusRes = await getMenus(true);
    menus.value = menusRes.data;
    
    // 更新 activeMenu 的引用，确保 subMenus 是最新的
    if (activeMenu.value) {
      const updatedActiveMenu = menus.value.find(m => m.id === activeMenu.value.id);
      if (updatedActiveMenu) {
        activeMenu.value = updatedActiveMenu;
      }
    }
  } catch (error) {
    alert('排序失败：' + (error.response?.data?.error || error.message));
  }
}

// ========== 批量移动相关函数 ==========

// 取消移动
function cancelMove() {
  showMovePanel.value = false;
  targetMenuId.value = null;
  targetSubMenuId.value = null;
}

// 切换卡片选中状态
function toggleCardSelection(card) {
  const index = selectedCards.value.findIndex(c => c.id === card.id);
  if (index > -1) {
    selectedCards.value.splice(index, 1);
    if (selectedCards.value.length === 0) {
      showMovePanel.value = false;
    }
  } else {
    selectedCards.value.push(card);
  }
}

// 清空选择
function clearSelection() {
  selectedCards.value = [];
  showMovePanel.value = false;
  showGroupSelectMenu.value = false;
}

// 切换分组选择菜单
function toggleGroupSelectMenu() {
  showGroupSelectMenu.value = !showGroupSelectMenu.value;
}

// 全选当前显示的所有卡片
function selectAllCards() {
  const allVisibleCards = [];
  if (!activeSubMenu.value && activeMenu.value && groupedCards.value.length > 0) {
    for (const group of groupedCards.value) {
      const groupCards = sortAndFilterCards(group.cards, group.subMenuId);
      allVisibleCards.push(...groupCards);
    }
  } else {
    allVisibleCards.push(...sortedFilteredCards.value);
  }
  
  for (const card of allVisibleCards) {
    if (!selectedCards.value.some(c => c.id === card.id)) {
      selectedCards.value.push(card);
    }
  }
  showGroupSelectMenu.value = false;
}

// 选择某个分组的所有卡片
function selectGroupCards(group) {
  const groupCards = sortAndFilterCards(group.cards, group.subMenuId);
  for (const card of groupCards) {
    if (!selectedCards.value.some(c => c.id === card.id)) {
      selectedCards.value.push(card);
    }
  }
  showGroupSelectMenu.value = false;
}


// 显示 Toast 提示
let toastTimer = null;
function showToastMessage(message, type = 'success', duration = 2000) {
  // 清除之前的定时器
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  
  // 如果消息为空，直接关闭
  if (!message) {
    showToast.value = false;
    return;
  }
  
  toastMessage.value = message;
  showToast.value = true;
  
  // duration 为 0 时不自动关闭
  if (duration > 0) {
    toastTimer = setTimeout(() => {
      showToast.value = false;
    }, duration);
  }
}

// 显示进度弹窗
function showProgress(title, message, status = 'loading') {
  progressTitle.value = title;
  progressMessage.value = message;
  progressStatus.value = status;
  showProgressModal.value = true;
}

// 更新进度弹窗
function updateProgress(message, status = 'loading') {
  progressMessage.value = message;
  progressStatus.value = status;
}

// 关闭进度弹窗
function closeProgressModal() {
  showProgressModal.value = false;
}

// 清除所有卡片缓存
function clearAllCardsCache() {
  cardsCache.value = {};
  localStorage.removeItem(CARDS_CACHE_KEY);
}

// 标记需要强制刷新（卡片数据变更后使用）
const needForceRefresh = ref(false);

// 移动卡片到指定分类
const isMovingCards = ref(false);

async function moveCardToCategory(menuId, subMenuId) {
  if (selectedCards.value.length === 0) return;
  if (isMovingCards.value) return;
  
  isMovingCards.value = true;
  
  // 过滤掉已经在目标分类中的卡片
  const cardsToMove = selectedCards.value.filter(card => {
    const cardMenuId = card.menu_id;
    const cardSubMenuId = card.sub_menu_id || null;
    const targetSubId = subMenuId || null;
    return !(cardMenuId === menuId && cardSubMenuId === targetSubId);
  });
  
  const skippedCount = selectedCards.value.length - cardsToMove.length;
  
  // 如果所有卡片都已在目标分类中
  if (cardsToMove.length === 0) {
    showToastMessage('所有选中的卡片已在该分类中', 'info');
    showMovePanel.value = false;
    isMovingCards.value = false;
    return;
  }
  
  const count = cardsToMove.length;
  
  // 显示进度弹窗
  showProgress('移动卡片', `正在移动 ${count} 个卡片...`);
  
  try {
    // 1. 调用API保存（逐个调用，确保每个都成功）
    const successfulMoves = [];
    const failedCards = [];
    let newDataVersion = null;
    
    for (const card of cardsToMove) {
      const updateData = {
        menu_id: menuId,
        sub_menu_id: subMenuId,
        title: card.title,
        url: card.url,
        logo_url: card.logo_url,
        desc: card.desc,
        order: card.order || 0,
        section: card.section || ''
      };
      
      try {
        const res = await updateCard(card.id, updateData);
        const data = res.data;
        
        // 保存后端返回的新版本号
        if (data.dataVersion) {
          newDataVersion = data.dataVersion;
        }
        
        // 验证后端返回的数据是否正确
        if (data.success && data.card) {
          const returnedCard = data.card;
          const isCorrect = returnedCard.menu_id === menuId && 
            (returnedCard.sub_menu_id === subMenuId || (returnedCard.sub_menu_id === null && subMenuId === null));
          
          if (isCorrect) {
            successfulMoves.push({ cardId: card.id, newData: returnedCard });
          } else {
            failedCards.push(card.title);
          }
        } else {
          failedCards.push(card.title);
        }
      } catch (err) {
        failedCards.push(card.title);
      }
    }
    
    // 2. 检查是否有失败的卡片
    if (failedCards.length > 0 && successfulMoves.length === 0) {
      throw new Error(`所有卡片移动失败：${failedCards.join(', ')}`);
    }
    
    // 3. 更新数据版本号并清除缓存
    if (newDataVersion) {
      saveDataVersion(newDataVersion);
    }
    clearAllCardsCache();
    
    // 4. 强制从服务器刷新当前分类数据
    await loadCards(true);
    
    // 5. 显示结果
    let resultMsg = '';
    if (failedCards.length > 0) {
      resultMsg = `成功移动 ${successfulMoves.length} 个卡片，${failedCards.length} 个失败`;
    } else if (skippedCount > 0) {
      resultMsg = `成功移动 ${count} 个卡片，跳过 ${skippedCount} 个已在该分类中的卡片`;
    } else {
      resultMsg = `成功移动 ${count} 个卡片！`;
    }
    updateProgress(resultMsg, 'success');
      
    clearSelection();
  } catch (error) {
    console.error('移动卡片失败:', error);
    updateProgress(`移动失败：${error.response?.data?.error || error.message}`, 'error');
  } finally {
    isMovingCards.value = false;
  }
}

async function handleRemoveFromFrequent(card) {
  if (!confirm(`确定要将「${card.title}」从常用列表中移除吗？\n\n这只是清除点击记录，不会删除卡片本身。\n如需彻底删除，请到对应分类视图中操作。`)) return;

  try {
    await removeFromFrequent(card.id);
    frequentCards.value = frequentCards.value.filter(c => c.id !== card.id);
    localStorage.setItem(FREQUENT_CACHE_KEY, JSON.stringify({
      data: frequentCards.value,
      timestamp: Date.now()
    }));
  } catch (err) {
    alert('移除失败: ' + (err.response?.data?.error || err.message));
  }
}

const isDeletingCard = ref(false);

async function handleDeleteCard(card) {
  if (!confirm(`确定要删除「${card.title}」吗？`)) return;
  if (isDeletingCard.value) return;
  
  isDeletingCard.value = true;
  showProgress('删除卡片', `正在删除「${card.title}」...`);
  
  try {
    const res = await deleteCard(card.id);
    
    if (res.data.dataVersion) {
      saveDataVersion(res.data.dataVersion);
    }
    
    syncCurrentCardLists(list => list.filter(item => item.id !== card.id));
    clearAllCardsCache();
    await loadCards(true);
    
    const selectedIndex = selectedCards.value.findIndex(c => c.id === card.id);
    if (selectedIndex > -1) {
      selectedCards.value.splice(selectedIndex, 1);
    }
    
    updateProgress('删除成功！', 'success');
  } catch (error) {
    console.error('删除卡片失败:', error);
    updateProgress('删除失败：' + (error.response?.data?.error || error.message), 'error');
  } finally {
    isDeletingCard.value = false;
  }
}

// 编辑卡片
async function handleEditCard(card) {
  editingCard.value = card;
  cardEditForm.value = {
    title: card.title || '',
    url: card.url || '',
    logo_url: card.logo_url || '',
    desc: card.desc || '',
    section: card.section || ''
  };
  editError.value = '';
  showEditCardModal.value = true;
  loadSectionSuggestions();
  
  // 刷新 AI 配置状态（确保最新）
  checkAIConfig();
}

// 检查 AI 是否已配置（使用公开接口，无需认证）
async function checkAIConfig() {
  try {
    const res = await api.get('/api/ai/status');
    aiConfigured.value = res.data.success && res.data.data.available;
  } catch (e) {
    aiConfigured.value = false;
  }
}

// 关闭卡片编辑模态框
function closeEditCardModal() {
  showEditCardModal.value = false;
  editingCard.value = null;
  cardEditForm.value = {
    title: '',
    url: '',
    logo_url: '',
    desc: '',
    section: ''
  };
}

function getFriendlyAIErrorMessage(err) {
  const status = err.response?.status;
  const serverMessage = err.response?.data?.message || err.response?.data?.error || '';
  const rawMessage = String(serverMessage || err.message || '').trim();
  const lowerMessage = rawMessage.toLowerCase();

  if (!err.response) {
    if (lowerMessage.includes('no such host') || lowerMessage.includes('enotfound') || lowerMessage.includes('lookup')) {
      return 'AI 服务地址无法解析，请检查后台配置的 API 域名是否正确。';
    }
    if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused')) {
      return 'AI 服务连接被拒绝，请检查后台配置的服务地址和端口是否可用。';
    }
    if (lowerMessage.includes('timeout') || lowerMessage.includes('aborted') || lowerMessage.includes('econnaborted')) {
      return 'AI 服务响应超时，请稍后重试，或在后台调整请求超时时间。';
    }
    return '无法连接到 AI 服务，请检查网络或后台 AI 配置。';
  }

  if (status === 400) {
    return serverMessage || 'AI 请求参数有误，请检查卡片网址和后台 AI 配置。';
  }
  if (status === 401) {
    return 'AI 配置已过期，请重新输入管理密码后再试。';
  }
  if (status === 403) {
    return serverMessage || 'AI 服务拒绝了本次请求，请检查 API Key 或权限配置。';
  }
  if (status === 404) {
    return 'AI 接口地址不存在，请检查后台配置的 Base URL 是否正确。';
  }
  if (status === 429) {
    return 'AI 请求过于频繁或额度已用尽，请稍后再试。';
  }
  if (status >= 500) {
    if (lowerMessage.includes('no such host') || lowerMessage.includes('lookup')) {
      return 'AI 服务地址无法解析，请检查后台配置的 API 域名是否正确。';
    }
    if (lowerMessage.includes('api request failed (500)')) {
      return 'AI 服务调用失败，请检查后台配置的模型、接口地址或服务商状态。';
    }
    return serverMessage || 'AI 服务暂时不可用，请稍后重试或检查后台配置。';
  }

  return serverMessage || 'AI 服务不可用，请先在后台检查 AI 配置。';
}

// AI 生成名称（多候选点选）
async function generateAIName() {
  if (!cardEditForm.value.url) {
    showToastMessage('请先输入网址', 'error');
    return;
  }
  aiOptions.value = { field: 'title', list: [], loading: true };
  aiGeneratingName.value = true;
  try {
    const res = await api.post('/api/ai/generate-options', {
      type: 'name',
      card: { title: cardEditForm.value.title || '', url: cardEditForm.value.url }
    });
    if (res.data.success && res.data.candidates?.length) {
      aiOptions.value = { field: 'title', list: res.data.candidates, loading: false };
    } else {
      aiOptions.value = { field: null, list: [], loading: false };
      showToastMessage(res.data.message || 'AI 生成失败，请手动输入或重试', 'error');
    }
  } catch (err) {
    aiOptions.value = { field: null, list: [], loading: false };
    showToastMessage(getFriendlyAIErrorMessage(err), 'error');
  } finally {
    aiGeneratingName.value = false;
  }
}

// AI 生成描述（多候选点选）
async function generateAIDescription() {
  if (!cardEditForm.value.url) {
    showToastMessage('请先输入网址', 'error');
    return;
  }
  aiOptions.value = { field: 'desc', list: [], loading: true };
  aiGenerating.value = true;
  try {
    const res = await api.post('/api/ai/generate-options', {
      type: 'description',
      card: { title: cardEditForm.value.title || '', url: cardEditForm.value.url }
    });
    if (res.data.success && res.data.candidates?.length) {
      aiOptions.value = { field: 'desc', list: res.data.candidates, loading: false };
    } else {
      aiOptions.value = { field: null, list: [], loading: false };
      showToastMessage(res.data.message || 'AI 生成失败，请手动输入或重试', 'error');
    }
  } catch (err) {
    aiOptions.value = { field: null, list: [], loading: false };
    showToastMessage(getFriendlyAIErrorMessage(err), 'error');
  } finally {
    aiGenerating.value = false;
  }
}

// 应用某个候选到对应字段
function applyAIOption(field, value) {
  if (field === 'title') cardEditForm.value.title = value;
  else if (field === 'desc') cardEditForm.value.desc = value;
  aiOptions.value = { field: null, list: [], loading: false };
  showToastMessage(field === 'title' ? '已应用名称' : '已应用描述', 'success');
}
// 关闭候选气泡
function closeAIOptions() {
  aiOptions.value = { field: null, list: [], loading: false };
}

// 保存卡片编辑
async function saveCardEdit() {
  if (!cardEditForm.value.title.trim()) {
    editError.value = '请输入标题';
    return;
  }
  if (!cardEditForm.value.url.trim()) {
    editError.value = '请输入网址';
    return;
  }
  
  editLoading.value = true;
  editError.value = '';
  
  const cardId = editingCard.value.id;
  const updatedData = {
    title: cardEditForm.value.title,
    url: cardEditForm.value.url,
    logo_url: cardEditForm.value.logo_url,
    desc: cardEditForm.value.desc,
    section: cardEditForm.value.section || ''
  };
  
    try {
        // 1. 先调用API保存
        await updateCard(cardId, {
          ...editingCard.value,
          ...updatedData
        });
        
        // 2. API成功后，清除缓存并强制重新加载当前菜单的所有卡片
        // 这是最可靠的方式，确保数据一致性
        cardsCache.value = {};
        localStorage.removeItem(CARDS_CACHE_KEY);
        
        // 强制重新加载卡片
        await loadCards(true);
        
        // 更新 allCards（用于搜索）
        const cardIndex = allCards.value.findIndex(c => c.id === cardId);
        if (cardIndex > -1) {
          allCards.value = allCards.value.map(c =>
            c.id === cardId ? { ...c, ...updatedData } : c
          );
        }

        syncCurrentCardLists(list => list.map(c =>
          c.id === cardId
            ? { ...c, ...updatedData }
            : c
        ));
        
        // 更新 selectedCards
        selectedCards.value = selectedCards.value.map(c => {
          if (c.id === cardId) {
            return { ...c, ...updatedData };
          }
          return c;
        });
        
        showToastMessage('修改成功', 'success');
        closeEditCardModal();
      } catch (error) {
    console.error('保存卡片失败:', error);
    const status = error.response?.status;
    const serverMessage = error.response?.data?.error || error.response?.data?.message;
    let reason = serverMessage || error.message || '未知错误';

    if (!error.response) {
      reason = '无法连接到服务器，请检查网络连接或稍后重试';
    } else if (status === 400) {
      reason = serverMessage || '提交的数据无效，请检查卡片信息';
    } else if (status === 404) {
      reason = '该卡片可能已被删除或当前链接已失效，请刷新页面后重试';
    } else if (status >= 500) {
      reason = serverMessage || '服务器暂时无法处理这张卡片，请稍后重试';
    }

    editError.value = '';
    alert(`保存失败：${reason}`);
  } finally {
    editLoading.value = false;
  }
}
</script>

<style scoped src="../styles/home.css"></style>
