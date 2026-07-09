<script>
export default {
  onLaunch: function () {
    console.log('App Launch')
    // 检查 Token 是否存在，不存在则重定向至登录页
    const token = uni.getStorageSync('token');
    // 跨平台获取当前页面路径
    const pages = getCurrentPages && getCurrentPages();
    const currentPath = pages && pages.length > 0 ? pages[pages.length - 1].route : '';

    // 如果没有 token 且当前不是登录页，则跳转
    if (!token && !currentPath.includes('login')) {
      uni.reLaunch({ url: '/pages/login/login' });
    }
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
}
</script>

<style>
/* 历史持仓弹框 - 分仓操作记录列表样式（全局，避免 scoped 无法命中 Ant Design 子组件） */
.expand-column-title {
  display: inline-block;
  padding-left: 8px;
  white-space: nowrap;
}

.history-holdings-modal .ant-modal {
  height: 80vh;
  margin: 0 auto;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
}

.history-holdings-modal .ant-modal-content {
  flex: 1;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.history-holdings-modal .ant-modal-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.history-holdings-modal .ant-table-expanded-row-fixed,
.history-holdings-modal .ant-table-expanded-row {
  padding: 0 0 16px 0 !important;
  background: #fbfbfb !important;
}

.history-holdings-modal .ant-table-expanded-row-fixed > td,
.history-holdings-modal .ant-table-expanded-row > td {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.history-holdings-modal .group-collapse {
  width: 100% !important;
}

.history-holdings-modal .group-collapse .ant-collapse-header {
  padding: 12px 24px !important;
}

.history-holdings-modal .group-collapse .ant-collapse-content-box {
  padding: 12px 0 !important;
}

.history-holdings-modal .group-collapse .ant-collapse-header-text,
.history-holdings-modal .group-collapse .ant-collapse-expand-icon {
  margin-left: 0 !important;
  padding-left: 0 !important;
}

.history-holdings-modal .group-trades-table,
.history-holdings-modal .group-trades-table .ant-table,
.history-holdings-modal .group-trades-table .ant-table-container,
.history-holdings-modal .group-trades-table .ant-table-content,
.history-holdings-modal .group-trades-table table {
  width: 100% !important;
}

.history-holdings-modal .group-trades-table .ant-table {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.history-holdings-modal .group-trades-table .ant-table-cell {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

.history-holdings-modal .group-trades-table .ant-table-thead > tr > th:first-child,
.history-holdings-modal .group-trades-table .ant-table-tbody > tr > td:first-child {
  padding-left: 24px !important;
}

.group-loading {
  padding: 24px 0;
  text-align: center;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 14px;
}

.group-title {
  font-weight: 500;
}

.group-header .profit {
  color: #cf1322;
  font-weight: 500;
}

.group-header .loss {
  color: #3f8600;
  font-weight: 500;
}
</style>
