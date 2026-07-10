<template>
  <a-layout style="min-height: 100vh">
    <!-- Top Header -->
    <a-layout-header style="position: fixed; top: 0; z-index: 100; width: 100%; background: #fff; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 48px; box-shadow: 0 1px 4px rgba(0,21,41,.08);">
      <div style="display: flex; align-items: center;">
        <div class="logo-header">
          <img src="/static/logo.svg" alt="logo" />
          <span>Stock Review</span>
        </div>
      </div>
      <div class="header-right">
         <a-button type="primary" @click="showAddModal">
           <template #icon><PlusOutlined /></template>
           添加交易
         </a-button>
      </div>
    </a-layout-header>

    <a-layout style="margin-top: 48px; min-width: 1200px; overflow-x: auto;">
      <a-layout-sider 
        v-model:collapsed="collapsed" 
        collapsible 
        theme="light"
        :width="200"
        :collapsed-width="64"
        style="box-shadow: 2px 0 8px 0 rgba(29,35,41,.05); z-index: 10; height: calc(100vh - 48px); position: fixed; left: 0; top: 48px; bottom: 0; display: flex; flex-direction: column; background: #fff;"
        :trigger="null"
      >
        <!-- Custom Trigger -->
        <div class="sider-trigger" @click="() => (collapsed = !collapsed)">
          <component :is="collapsed ? RightOutlined : LeftOutlined" />
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 8px 8px 0;">
          <a-menu 
            v-model:selectedKeys="selectedKeys" 
            theme="light" 
            mode="inline" 
            @click="handleMenuClick"
            style="border-right: 0; width: 100%;"
          >
            <a-menu-item key="assets">
              <template #icon>
                <PieChartOutlined />
              </template>
              <span>我的资产</span>
            </a-menu-item>
            <a-menu-item key="review">
              <template #icon>
                <FileTextOutlined />
              </template>
              <span>复盘日志</span>
            </a-menu-item>
          </a-menu>
        </div>
        
        <!-- User Info at Bottom of Sidebar -->
        <a-dropdown placement="topLeft">
          <div :class="collapsed ? 'sider-user-info-collapsed' : 'sider-user-info'">
            <a-avatar size="small" :src="safeAvatar" style="background-color: #1890ff; vertical-align: middle;">
              {{ userStore.userInfo?.nickname?.charAt(0) || 'A' }}
            </a-avatar>
            <span v-if="!collapsed" class="username">{{ userStore.userInfo?.nickname || 'Admin' }}</span>
          </div>
          <template #overlay>
            <a-menu @click="handleUserMenuClick">
              <a-menu-item key="profile">
                <template #icon>
                  <UserOutlined />
                </template>
                <span>个人中心</span>
              </a-menu-item>
              <a-menu-item key="logout">
                <template #icon>
                  <LogoutOutlined />
                </template>
                <span>退出账号</span>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-sider>
      
      <a-layout style="background: #f0f2f5; transition: margin-left 0.2s;" :style="{ marginLeft: collapsed ? '64px' : '200px' }">
        <a-layout-content style="min-height: calc(100vh - 48px); position: relative; padding: 16px 24px;">
            <!-- Global Loading Overlay -->
            <div v-if="store.loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.6); z-index: 999; display: flex; align-items: center; justify-content: center;">
               <a-spin size="large" />
            </div>

            <!-- Page Header Wrapper -->
             <div class="page-header-wrapper" style="margin-bottom: 16px;">
                <a-breadcrumb>
                  <a-breadcrumb-item>首页</a-breadcrumb-item>
                  <a-breadcrumb-item>{{ pageTitle }}</a-breadcrumb-item>
                </a-breadcrumb>
                <div class="page-title">{{ pageTitle }}</div>
             </div>
            
            <!-- Main Content -->
            <slot></slot>
        </a-layout-content>
      </a-layout>
    </a-layout>
    
    <TradeModal v-model:open="isModalVisible" @success="handleAddSuccess" />
  </a-layout>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  PieChartOutlined,
  FileTextOutlined,
  LogoutOutlined,
  CopyrightOutlined,
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LeftOutlined,
  RightOutlined,
  UserOutlined
} from '@ant-design/icons-vue';
import TradeModal from '@/components/TradeModal.vue';
import { useTradeStore } from '@/stores/trade';
import { useUserStore } from '@/stores/user';
import { message } from 'ant-design-vue';

const props = defineProps({
  pageTitle: {
    type: String,
    default: 'Dashboard'
  },
  activeKey: {
    type: String,
    default: 'assets'
  }
});

const store = useTradeStore();
const userStore = useUserStore();
const collapsed = ref(false);
const selectedKeys = ref([props.activeKey]);
const isModalVisible = ref(false);
const safeAvatar = computed(() => {
  const avatar = userStore.userInfo?.avatar;
  if (!avatar || typeof avatar !== 'string') return undefined;
  if (/^https:\/\/example\.com\//i.test(avatar)) return undefined;
  return avatar;
});

watch(() => props.activeKey, (newVal) => {
  selectedKeys.value = [newVal];
});

const handleMenuClick = ({ key }) => {
  if (key === 'assets') {
    uni.redirectTo({ url: '/pages/assets/index' });
  } else if (key === 'review') {
    uni.redirectTo({ url: '/pages/review/list' });
  }
};

const handleUserMenuClick = ({ key }) => {
  if (key === 'profile') {
    uni.navigateTo({ url: '/pages/user/profile' });
  } else if (key === 'logout') {
    handleLogout();
  }
};

const handleLogout = () => {
  userStore.logout();
  uni.reLaunch({ url: '/pages/login/login' });
};

const showAddModal = () => {
  isModalVisible.value = true;
};

const handleAddSuccess = () => {
  message.success('交易记录已添加');
};

</script>

<style scoped>
.logo-header {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
  flex-shrink: 0;
}

.logo-header img {
  height: 28px;
  width: 28px;
}

.logo-header span {
  color: #1f1f1f;
  font-size: 16px;
  font-weight: 600;
  margin-left: 8px;
  white-space: nowrap;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
}

.page-header-wrapper {
  /* padding: 16px 24px 0; */
}

.page-title {
  font-size: 20px;
  color: rgba(0,0,0,0.85);
  font-weight: 600;
  margin-top: 8px;
  margin-bottom: 0;
  line-height: 32px;
}

.sider-user-info {
  height: 48px;
  padding: 0 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
}

.sider-user-info:hover {
  background: rgba(0,0,0,0.025);
}

.sider-user-info-collapsed {
  height: 48px;
  padding: 0;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
}

.sider-user-info-collapsed:hover {
  background: rgba(0,0,0,0.025);
}

.username {
  margin-left: 8px;
  font-size: 14px;
  color: rgba(0,0,0,0.65);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sider-trigger {
  position: absolute;
  top: 12px;
  right: -12px;
  z-index: 101;
  width: 24px;
  height: 24px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  color: #8c8c8c;
  font-size: 12px;
  transition: all 0.3s;
}

.sider-trigger:hover {
  color: #1890ff;
  border-color: #1890ff;
}

:deep(.ant-menu-item) {
   margin-top: 4px;
   margin-bottom: 4px;
   height: 40px;
   line-height: 40px;
   border-radius: 4px;
   width: calc(100% - 16px) !important;
   margin-left: 8px !important;
   margin-right: 8px !important;
 }

:deep(.ant-menu-item-selected) {
  background-color: #e6f7ff !important;
  color: #1890ff;
}

:deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
