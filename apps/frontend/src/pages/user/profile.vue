<template>
  <PCLayout page-title="个人中心" active-key="">
    <div class="profile-page">
<main class="settings-content">
        <div class="content-heading">
          <div><h1>基本设置</h1><p>管理你的个人资料与账户信息</p></div>
          <div class="heading-dot"></div>
        </div>

        <section class="profile-card">
          <div class="identity-panel">
            <div class="avatar-wrapper" @click="handleChooseAvatar">
              <a-avatar :size="112" :src="safeAvatar" class="profile-avatar">
                {{ userStore.userInfo?.nickname?.charAt(0) || userStore.userInfo?.username?.charAt(0) || 'U' }}
              </a-avatar>
              <div class="avatar-mask"><CameraOutlined /></div>
            </div>
            <h2>{{ userStore.userInfo?.nickname || userStore.userInfo?.username || '用户' }}</h2>
            <a-button class="avatar-button" @click="handleChooseAvatar">更换头像</a-button>
          </div>

          <div class="profile-form">
            <div class="section-title">个人资料</div>
            <a-form :model="formState" layout="vertical">
              <a-form-item label="用户名">
                <a-input :value="userStore.userInfo?.username || '--'" disabled>
                  <template #prefix><UserOutlined /></template>
                </a-input>
              </a-form-item>
              <a-form-item label="用户 ID">
                <a-input :value="userStore.userInfo?.id || userStore.userInfo?._id || '--'" disabled>
                  <template #prefix><IdcardOutlined /></template>
                </a-input>
              </a-form-item>
              <a-form-item label="昵称">
                <a-input v-model:value="formState.nickname" :max-length="20" show-count placeholder="请输入昵称" />
              </a-form-item>
              <a-button type="primary" :loading="saving" @click="handleSaveProfile">保存修改</a-button>
            </a-form>
          </div>
        </section>

        <section ref="wechatSection" :class="['binding-card', { bound: userStore.userInfo?.wechatBound }]">
          <div class="binding-trigger" @click="!userStore.userInfo?.wechatBound && handleBindWechat">
            <div class="binding-icon"><WechatOutlined /></div>
            <div class="binding-copy"><strong>{{ userStore.userInfo?.wechatBound ? '微信已绑定' : '绑定微信' }}</strong><span>{{ userStore.userInfo?.wechatBound ? '已绑定微信账号，可使用微信登录' : '点击此处绑定微信，登录更快捷' }}</span></div>
          </div>
          <span v-if="userStore.userInfo?.wechatBound" class="binding-status">已绑定</span>
        </section>
      </main>
    </div>

    <a-modal v-model:open="wechatQrVisible" title="扫码绑定微信" :footer="null" width="360px">
      <div class="wechat-qr-modal">
        <p>请使用微信扫描二维码完成绑定</p>
        <img v-if="wechatQrUrl" :src="wechatQrUrl" alt="微信绑定二维码" />
        <span>二维码有效期约 10 分钟</span>
      </div>
    </a-modal>

    <a-modal v-model:open="passwordModalVisible" title="修改密码" :confirm-loading="changingPassword" @ok="handleChangePassword" @cancel="handlePasswordCancel">
      <a-form :model="passwordForm" layout="vertical">
        <a-form-item label="旧密码"><a-input-password v-model:value="passwordForm.oldPassword" /></a-form-item>
        <a-form-item label="新密码"><a-input-password v-model:value="passwordForm.newPassword" /></a-form-item>
        <a-form-item label="确认新密码"><a-input-password v-model:value="passwordForm.confirmPassword" /></a-form-item>
      </a-form>
    </a-modal>
  </PCLayout>
</template><script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { CameraOutlined, WechatOutlined, UserOutlined, IdcardOutlined } from '@ant-design/icons-vue';
import PCLayout from '@/layouts/PCLayout.vue';
import { useUserStore } from '@/stores/user';
import {
  updateProfile,
  changePassword,
  uploadAvatar,
  getWechatBindUrl,
  unbindWechat
} from '@/api/index';

const userStore = useUserStore();

const formState = reactive({
  nickname: ''
});

const wechatSection = ref(null);

const safeAvatar = computed(() => {
  const avatar = userStore.userInfo?.avatar;
  if (!avatar || typeof avatar !== 'string') return undefined;
  if (/^https:\/\/example\.com\//i.test(avatar)) return undefined;
  return avatar;
});

const saving = ref(false);
const binding = ref(false);
const unbinding = ref(false);
const changingPassword = ref(false);
const passwordModalVisible = ref(false);
const wechatQrVisible = ref(false);
const wechatQrUrl = ref('');

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

onMounted(() => {
  // 进入页面时拉取最新资料
  userStore.fetchProfile().then(() => {
    formState.nickname = userStore.userInfo?.nickname || ''; 
  });

  // 澶勭悊寰俊鎺堟潈鍥炶皟缁撴灉
  checkWechatCallback();
});

const checkWechatCallback = () => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const wechatBind = params.get('wechat_bind');
  if (wechatBind === 'success') {
    message.success('寰俊缁戝畾鎴愬姛');
    userStore.fetchProfile();
    // 娓呯悊 URL 鍙傛暟
    cleanUrlParams();
  } else if (wechatBind === 'error') {
    const msg = params.get('message') || '寰俊缁戝畾澶辫触';
    message.error(decodeURIComponent(msg));
    cleanUrlParams();
  }
};

const cleanUrlParams = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('wechat_bind');
  url.searchParams.delete('message');
  window.history.replaceState({}, '', url.toString());
};

const handleSaveProfile = async () => {
  if (!formState.nickname || !formState.nickname.trim()) {
    message.warning('昵称不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateProfile({ nickname: formState.nickname.trim() });
    message.success('基本信息更新成功');
    await userStore.fetchProfile();
  } catch (err) {
    console.error('Save profile failed:', err);
  } finally {
    saving.value = false;
  }
};

const scrollToWechat = () => {
  wechatSection.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const handleSaveNickname = async () => {
  if (!formState.nickname || !formState.nickname.trim()) {
    message.warning('鏄电О涓嶈兘涓虹┖');
    return;
  }
  saving.value = true;
  try {
    await updateProfile({ nickname: formState.nickname.trim() });
    message.success('鏄电О淇濆瓨鎴愬姛');
  } catch (err) {
    console.error('Save nickname failed:', err);
  } finally {
    saving.value = false;
  }
};

const handleChooseAvatar = () => {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0];
      uploadAvatarFile(tempFilePath);
    },
    fail: (err) => {
      console.error('Choose image failed:', err);
    }
  });
};

const uploadAvatarFile = async (tempFilePath) => {
  try {
    const res = await uploadAvatar(tempFilePath);
    if (res?.avatar) {
      userStore.updateAvatar(res.avatar);
      message.success('澶村儚涓婁紶鎴愬姛');
    }
  } catch (err) {
    const msg = err?.message || '澶村儚涓婁紶澶辫触';
    message.error(msg);
  }
};

const handleChangePassword = async () => {
  const { oldPassword, newPassword, confirmPassword } = passwordForm;

  if (!oldPassword || !newPassword || !confirmPassword) {
    message.warning('请填写完整密码信息');
    return;
  }

  if (newPassword.length < 6) {
    message.warning('新密码至少6位');
    return;
  }

  if (newPassword !== confirmPassword) {
    message.warning('两次输入的新密码不一致');
    return;
  }

  changingPassword.value = true;
  try {
    await changePassword({ oldPassword, newPassword });
    message.success('瀵嗙爜淇敼鎴愬姛');
    passwordModalVisible.value = false;
    resetPasswordForm();
  } catch (err) {
    console.error('Change password failed:', err);
  } finally {
    changingPassword.value = false;
  }
};

const handlePasswordCancel = () => {
  passwordModalVisible.value = false;
  resetPasswordForm();
};

const resetPasswordForm = () => {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
};

const handleBindWechat = async () => {
  binding.value = true;
  try {
    const res = await getWechatBindUrl();
    if (res?.url) {
      wechatQrUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(res.url)}`;
      wechatQrVisible.value = true;
    } else {
      message.error('鑾峰彇寰俊鎺堟潈閾炬帴澶辫触');
    }
  } catch (err) {
    console.error('Get wechat bind url failed:', err);
  } finally {
    binding.value = false;
  }
};

const handleUnbindWechat = async () => {
  unbinding.value = true;
  try {
    await unbindWechat();
    message.success('寰俊瑙ｇ粦鎴愬姛');
    await userStore.fetchProfile();
  } catch (err) {
    console.error('Unbind wechat failed:', err);
  } finally {
    unbinding.value = false;
  }
};
</script><style lang="scss" scoped>
.profile-page { min-height: 680px; overflow: hidden; border: 1px solid #edf0f5; border-radius: 14px; background: #fff; box-shadow: 0 8px 28px rgba(31, 35, 41, .04); }
.settings-nav { width: 206px; flex: 0 0 206px; padding: 28px 14px; border-right: 1px solid #f0f2f5; background: linear-gradient(180deg, #fbfcff 0%, #f8faff 100%); }
.nav-caption { padding: 0 16px 16px; color: #a0a8b8; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
.settings-nav-item { display: block; width: 100%; margin: 4px 0; padding: 12px 16px; border: 0; border-radius: 9px; background: transparent; color: #5f6878; text-align: left; font-size: 14px; cursor: pointer; transition: all .2s; }
.settings-nav-item:hover { color: #1677ff; background: #edf5ff; }.settings-nav-item.active { color: #1677ff; background: #e6f4ff; font-weight: 600; box-shadow: inset 3px 0 #1677ff; }
.settings-content { min-width: 0; padding: 38px 52px 48px; background: radial-gradient(circle at 94% 0%, #f1f7ff 0, transparent 250px), #fff; }
.content-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }.eyebrow { color: #1677ff; font-size: 11px; font-weight: 700; letter-spacing: 2px; }.content-heading h1 { margin: 0 0 6px; color: #172033; font-size: 25px; }.content-heading p { margin: 0; color: #98a1b2; font-size: 13px; }.heading-dot { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #e6f4ff, #f4f8ff); }
.profile-card { display: grid; grid-template-columns: 220px minmax(360px, 1fr); gap: 54px; max-width: 980px; padding: 30px 32px 34px; border: 1px solid #edf0f5; border-radius: 14px; background: rgba(255,255,255,.88); }.identity-panel { display: flex; align-items: center; flex-direction: column; padding-top: 10px; border-right: 1px solid #f0f2f5; }.avatar-wrapper { position: relative; width: 112px; height: 112px; margin-bottom: 16px; overflow: hidden; border-radius: 50%; background: #e6f4ff; cursor: pointer; box-shadow: 0 8px 22px rgba(22,119,255,.15); }.profile-avatar { color: #1677ff; font-size: 38px; }.avatar-mask { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; background: rgba(22,119,255,.72); color: #fff; font-size: 22px; transition: opacity .2s; }.avatar-wrapper:hover .avatar-mask { opacity: 1; }.identity-panel h2 { max-width: 180px; margin: 0 0 12px; overflow: hidden; color: #172033; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }.avatar-button { border-radius: 7px; color: #667085; }
.profile-form { max-width: 560px; }.section-title { margin-bottom: 20px; color: #172033; font-size: 16px; font-weight: 600; }.profile-form :deep(.ant-form-item) { margin-bottom: 19px; }.profile-form :deep(.ant-form-item-label) { padding-bottom: 6px; }.profile-form :deep(.ant-form-item) { max-width: 480px; }.account-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 22px; }.meta-item { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-bottom: 1px solid #f0f2f5; }.meta-label { color: #98a1b2; font-size: 13px; }.meta-label .anticon { margin-right: 6px; color: #aab3c2; }.meta-item strong { color: #273142; font-size: 14px; font-weight: 500; word-break: break-all; }.profile-form :deep(.ant-input), .profile-form :deep(.ant-input-affix-wrapper) { border-radius: 6px; }
.binding-card { display: flex; align-items: center; gap: 14px; max-width: 980px; cursor: pointer; transition: border-color .2s, box-shadow .2s; margin-top: 20px; padding: 20px 24px; border: 1px solid #edf0f5; border-radius: 12px; }.binding-trigger { display: flex; align-items: center; gap: 14px; }.binding-trigger:hover { cursor: pointer; }.binding-trigger:hover .binding-copy strong { color: #1677ff; }.binding-card.bound { cursor: default; }.binding-card.bound .binding-icon { background: #e9f9ef; color: #07c160; }.binding-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: #e9f9ef; color: #07c160; font-size: 20px; }.binding-copy { display: flex; flex: 1; flex-direction: column; gap: 4px; }.binding-copy strong { color: #273142; font-size: 14px; }.binding-copy span { color: #98a1b2; font-size: 12px; }.binding-status { color: #07c160; font-size: 13px; }.binding-arrow { color: #1677ff; font-size: 13px; }.binding-arrow span { margin-left: 5px; font-size: 20px; vertical-align: -1px; }.wechat-qr-modal { text-align: center; padding: 4px 0 16px; }.wechat-qr-modal p { margin: 0 0 16px; color: #667085; }.wechat-qr-modal img { display: block; width: 240px; height: 240px; margin: 0 auto 14px; }.wechat-qr-modal span { color: #98a1b2; font-size: 12px; }
@media (max-width: 900px) { .settings-content { padding: 28px 32px; }.settings-content { padding: 28px 24px; }.profile-card { grid-template-columns: 1fr; gap: 28px; }.account-meta { grid-template-columns: 1fr; }.identity-panel { padding-bottom: 24px; border-right: 0; border-bottom: 1px solid #f0f2f5; } }
</style>















