<template>
  <PCLayout page-title="个人中心" active-key="">
    <div class="profile-container">
      <a-row :gutter="[24, 24]">
        <!-- 基本信息 -->
        <a-col :span="24">
          <a-card title="基本信息" :bordered="false">
            <a-form :model="formState" layout="vertical">
              <a-form-item label="头像">
                <div class="avatar-wrapper" @click="handleChooseAvatar">
                  <a-avatar :size="80" :src="safeAvatar" style="background-color: #1890ff; cursor: pointer;">
                    {{ userStore.userInfo?.nickname?.charAt(0) || userStore.userInfo?.username?.charAt(0) || 'U' }}
                  </a-avatar>
                  <div class="avatar-mask">
                    <CameraOutlined style="color: #fff; font-size: 20px;" />
                  </div>
                </div>
                <div class="avatar-tip">点击更换头像</div>
              </a-form-item>

              <a-form-item label="用户 ID">
                <a-input :value="userStore.userInfo?.id" disabled />
              </a-form-item>

              <a-form-item label="用户名">
                <a-input :value="userStore.userInfo?.username" disabled />
              </a-form-item>

              <a-form-item label="昵称">
                <a-input
                  v-model:value="formState.nickname"
                  placeholder="请输入昵称"
                  :max-length="20"
                  show-count
                />
              </a-form-item>

              <a-form-item>
                <a-button type="primary" :loading="saving" @click="handleSaveNickname">
                  保存
                </a-button>
              </a-form-item>
            </a-form>
          </a-card>
        </a-col>

        <!-- 账号安全 -->
        <a-col :span="24">
          <a-card title="账号安全" :bordered="false">
            <a-button type="default" @click="passwordModalVisible = true">
              修改密码
            </a-button>
          </a-card>
        </a-col>

        <!-- 微信绑定 -->
        <a-col :span="24">
          <a-card title="微信绑定" :bordered="false">
            <div class="wechat-card-content">
              <a-space>
                <WechatOutlined :style="{ fontSize: '24px', color: userStore.userInfo?.wechatBound ? '#07c160' : '#d9d9d9' }" />
                <span>{{ userStore.userInfo?.wechatBound ? '已绑定微信' : '未绑定微信' }}</span>
              </a-space>
              <a-button
                v-if="userStore.userInfo?.wechatBound"
                type="default"
                danger
                :loading="unbinding"
                @click="handleUnbindWechat"
              >
                解绑微信
              </a-button>
              <a-button
                v-else
                type="primary"
                :loading="binding"
                @click="handleBindWechat"
              >
                绑定微信
              </a-button>
            </div>
          </a-card>
        </a-col>
      </a-row>
    </div>

    <!-- 修改密码弹窗 -->
    <a-modal
      v-model:open="passwordModalVisible"
      title="修改密码"
      :confirm-loading="changingPassword"
      @ok="handleChangePassword"
      @cancel="handlePasswordCancel"
    >
      <a-form :model="passwordForm" layout="vertical">
        <a-form-item label="旧密码">
          <a-input-password v-model:value="passwordForm.oldPassword" placeholder="请输入旧密码" />
        </a-form-item>
        <a-form-item label="新密码">
          <a-input-password v-model:value="passwordForm.newPassword" placeholder="请输入新密码（至少6位）" />
        </a-form-item>
        <a-form-item label="确认新密码">
          <a-input-password v-model:value="passwordForm.confirmPassword" placeholder="请再次输入新密码" />
        </a-form-item>
      </a-form>
    </a-modal>
  </PCLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { CameraOutlined, WechatOutlined } from '@ant-design/icons-vue';
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

  // 处理微信授权回调结果
  checkWechatCallback();
});

const checkWechatCallback = () => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const wechatBind = params.get('wechat_bind');
  if (wechatBind === 'success') {
    message.success('微信绑定成功');
    userStore.fetchProfile();
    // 清理 URL 参数
    cleanUrlParams();
  } else if (wechatBind === 'error') {
    const msg = params.get('message') || '微信绑定失败';
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

const handleSaveNickname = async () => {
  if (!formState.nickname || !formState.nickname.trim()) {
    message.warning('昵称不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateProfile({ nickname: formState.nickname.trim() });
    message.success('昵称保存成功');
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
      message.success('头像上传成功');
    }
  } catch (err) {
    const msg = err?.message || '头像上传失败';
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
    message.success('密码修改成功');
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
      window.location.href = res.url;
    } else {
      message.error('获取微信授权链接失败');
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
    message.success('微信解绑成功');
    await userStore.fetchProfile();
  } catch (err) {
    console.error('Unbind wechat failed:', err);
  } finally {
    unbinding.value = false;
  }
};
</script>

<style lang="scss" scoped>
.profile-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 8px 0;
}

.avatar-wrapper {
  position: relative;
  display: inline-block;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;

  &:hover .avatar-mask {
    opacity: 1;
  }
}

.avatar-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  border-radius: 50%;
}

.avatar-tip {
  margin-top: 8px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
}

.wechat-card-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
