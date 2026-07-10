import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getProfile, updateProfile as apiUpdateProfile } from '@/api/index';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref(null);

  /**
   * 从本地缓存初始化用户信息
   */
  const initFromStorage = () => {
    try {
      const stored = uni.getStorageSync('userInfo');
      if (stored) {
        userInfo.value = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse userInfo from storage', e);
      userInfo.value = null;
    }
  };

  /**
   * 设置用户信息并同步到本地缓存
   */
  const setUserInfo = (info) => {
    userInfo.value = info;
    if (info) {
      uni.setStorageSync('userInfo', JSON.stringify(info));
    } else {
      uni.removeStorageSync('userInfo');
    }
  };

  /**
   * 获取最新用户资料
   */
  const fetchProfile = async () => {
    try {
      const res = await getProfile();
      setUserInfo(res);
      return res;
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      throw err;
    }
  };

  /**
   * 更新用户资料
   */
  const updateProfile = async (payload) => {
    try {
      const res = await apiUpdateProfile(payload);
      setUserInfo(res);
      return res;
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  };

  /**
   * 更新头像 URL
   */
  const updateAvatar = (url) => {
    if (userInfo.value) {
      setUserInfo({ ...userInfo.value, avatar: url });
    }
  };

  /**
   * 退出登录，清除状态
   */
  const logout = () => {
    userInfo.value = null;
    uni.removeStorageSync('token');
    uni.removeStorageSync('userInfo');
  };

  // 初始化
  initFromStorage();

  return {
    userInfo,
    setUserInfo,
    fetchProfile,
    updateProfile,
    updateAvatar,
    logout
  };
});
