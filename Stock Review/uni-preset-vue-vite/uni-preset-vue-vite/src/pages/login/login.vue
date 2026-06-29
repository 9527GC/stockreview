<template>
  <div class="login-container" :style="loginBackgroundStyle">
    <div class="login-wrapper">
      <div class="header">
        <div class="logo-title">
          <img class="logo" src="/static/logo.svg" />
          <span class="title">Stock Review</span>
        </div>
        <span class="subtitle">专业的股票复盘助手</span>
      </div>

      <div class="login-main">
        <div class="form-item">
          <a-input
            v-model:value="formState.username"
            placeholder="请输入账号"
            size="large"
          >
            <template #prefix>
              <UserOutlined style="color: rgba(0,0,0,.25)" />
            </template>
          </a-input>
        </div>
        <div class="form-item">
          <a-input-password
            v-model:value="formState.password"
            placeholder="请输入密码"
            size="large"
          >
            <template #prefix>
              <LockOutlined style="color: rgba(0,0,0,.25)" />
            </template>
          </a-input-password>
        </div>

        <div class="actions">
          <a-checkbox v-model:checked="autoLogin">自动登录</a-checkbox>
          <a class="forgot-pwd" @click="handleForgotPassword">忘记密码?</a>
        </div>

        <div class="btn-group">
          <a-button type="primary" block size="large" @click="handleLogin" :loading="loading">
            登录
          </a-button>
        </div>

        <div class="social-login">
           <span class="label">其他登录方式：</span>
           <div class="icons">
              <WechatOutlined class="social-icon" @click="handleWechatLogin" />
           </div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <div class="links">
        <span class="link">Stock Review</span>
      </div>
      <span class="copyright">Copyright <CopyrightOutlined style="margin: 0 4px;" /> 9527</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { login } from '@/api/index'
import { appConfig } from '@/config/env'
import {
  UserOutlined,
  LockOutlined,
  WechatOutlined,
  CopyrightOutlined
} from '@ant-design/icons-vue'

const formState = reactive({
  username: '',
  password: ''
})
const autoLogin = ref(uni.getStorageSync('autoLogin') === 'true')
const loading = ref(false)
const loginBackgroundStyle = appConfig.loginBackgroundUrl
  ? { backgroundImage: `url('${appConfig.loginBackgroundUrl}')` }
  : {}

// Initialize username from storage
onMounted(() => {
  const storedUsername = uni.getStorageSync('lastUsername');
  if (storedUsername) {
    formState.username = storedUsername;
  }
})

const handleLogin = async () => {
  if (!formState.username || !formState.password) {
    message.warning('请输入账号和密码')
    return
  }

  loading.value = true

  try {
    const res = await login({
      username: formState.username,
      password: formState.password
    });

    uni.setStorageSync('token', res.token);
    uni.setStorageSync('userInfo', JSON.stringify(res.userInfo));

    // Save auto-login preference and username
    uni.setStorageSync('autoLogin', autoLogin.value ? 'true' : 'false');
    uni.setStorageSync('lastUsername', formState.username);

    message.success('登录成功');

    // 登录成功后跳转
    setTimeout(() => {
       uni.reLaunch({ url: '/pages/assets/index' })
    }, 500)
  } catch (err) {
    console.error('Login failed:', err);
  } finally {
    loading.value = false;
  }
}

const handleWechatLogin = () => {
  message.loading('正在调起微信登录...', 1)
  setTimeout(() => {
     message.success('模拟微信登录成功')
  }, 1000)
}

const handleForgotPassword = () => {
  message.info('点击了忘记密码')
}
</script>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  background-color: #f0f2f5;
  background-image: none;
  background-repeat: no-repeat;
  background-position: center 110px;
  background-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0 24px;
}

.login-wrapper {
  flex: 1;
  padding: 32px 0 320px;
  width: 328px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.header {
  text-align: center;
  margin-bottom: 40px;
  
  .logo-title {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    line-height: 44px;
    margin-bottom: 12px;
    
    .logo {
      width: 44px;
      height: 44px;
      margin-right: 16px;
    }
    
    .title {
      position: relative;
      top: 2px;
      color: rgba(0, 0, 0, 0.85);
      font-weight: 600;
      font-size: 33px;
      font-family: Avenir, 'Helvetica Neue', Arial, Helvetica, sans-serif;
    }
  }
  
  .subtitle {
    color: rgba(0, 0, 0, 0.45);
    font-size: 14px;
  }
}

.login-main {
  width: 328px;
  margin: 0 auto;
}

.form-item {
  margin-bottom: 24px;
}

.captcha-row {
  display: flex;
  align-items: center;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  .forgot-pwd {
    color: rgba(0, 0, 0, 0.85);
    font-size: 14px;
    cursor: pointer;
  }
}

.btn-group {
  margin-bottom: 24px;
}

.social-login {
  display: flex;
  align-items: center;
  margin-top: 24px;
  
  .label {
    color: rgba(0, 0, 0, 0.45);
    font-size: 14px;
    margin-right: 8px;
  }
  
  .icons {
    display: flex;
    align-items: center;
    
    .social-icon {
      font-size: 24px;
      color: #d9d9d9;
      cursor: pointer;
      transition: color 0.3s;
      
      &:hover {
        color: #07c160;
      }
    }
  }
}

.footer {
  margin: 48px 0 24px;
  text-align: center;
  
  .links {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    
    .link {
      color: rgba(0, 0, 0, 0.45);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;
      margin: 0 8px;
      
      &:hover {
        color: rgba(0, 0, 0, 0.65);
      }
    }
    
    .github-icon {
      font-size: 14px;
      color: rgba(0, 0, 0, 0.45);
      margin: 0 8px;
    }
  }
  
  .copyright {
    color: rgba(0, 0, 0, 0.45);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* Mobile responsive adjustments */
@media screen and (max-width: 576px) {
  .login-container {
    background-image: none;
    padding: 32px 20px;
    align-items: stretch;
  }
  
  .login-wrapper {
    width: 100%;
  }
  
  .login-main {
    width: 100%;
  }
  
  .footer {
    margin-top: auto;
  }
}
</style>
