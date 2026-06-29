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
/*每个页面公共css */
</style>
