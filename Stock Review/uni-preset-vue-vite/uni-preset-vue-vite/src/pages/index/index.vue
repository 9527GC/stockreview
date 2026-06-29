<template>
  <view class="content">
    <image class="logo" src="/static/logo.svg"></image>
    <view class="text-area">
      <text class="title">{{ title }}</text>
    </view>
    <view style="margin-top: 20px;">
      <wd-button type="primary" @click="showToast">Wot Design Button</wd-button>
      <wd-toast />
    </view>
  </view>
</template>

<script>
import { useToast } from 'wot-design-uni'

export default {
  setup() {
    const toast = useToast()
    return { toast }
  },
  data() {
    return {
      title: 'Hello',
    }
  },
  onLoad() {},
  methods: {
    showToast() {
      this.toast.show('Hello Wot Design Uni')
    }
  },
}
</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 200rpx;
  width: 200rpx;
  margin-top: 200rpx;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
}

.title {
  font-size: 36rpx;
  color: #8f8f94;
}
</style>
