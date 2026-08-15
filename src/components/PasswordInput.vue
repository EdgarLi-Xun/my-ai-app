<script setup lang="ts">
/**
 * 密码输入组件 / Password input component（ADR 0007 D9-D10）
 *
 * 封装 `<input>` 的 `type` 切换（password ↔ text）+ 右侧小眼睛按钮（uni-icons）+ v-model 透传。
 * 适用场景：登录密码、注册密码、API Key 等敏感字符串输入框。
 */
import { computed, ref } from 'vue';

const props = defineProps<{
  /** v-model 绑定值 / v-model bound value */
  modelValue: string;
  /** 占位符 / placeholder text */
  placeholder?: string;
  /** 禁用态 / disabled state */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'blur'): void;
}>();

/** 是否显示明文 / whether to show plaintext */
const show = ref(false);
/** 当前 input type / current input type */
const inputType = computed<'password' | 'text'>(() => (show.value ? 'text' : 'password'));

function toggle(): void {
  if (props.disabled) return;
  show.value = !show.value;
}

function onInput(e: Event): void {
  // uni-app x 在事件回调里把值放进 `e.detail.value`；
  // 兼容写法：缺 detail 时退到 `e.target.value`（理论上不会触发，留保险）。
  const detail = (e as { detail?: { value?: unknown } }).detail;
  const target = (e as { target?: { value?: unknown } }).target;
  const value = typeof detail?.value === 'string'
    ? detail.value
    : typeof target?.value === 'string'
      ? target.value
      : '';
  emit('update:modelValue', value);
}
</script>

<template>
  <view class="pw-wrap">
    <input
      class="pw-input"
      :type="inputType"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @blur="emit('blur')"
    />
    <view
      class="pw-eye"
      :class="{ 'pw-eye-active': show, 'pw-eye-disabled': disabled }"
      hover-class="pw-eye-hover"
      @click="toggle"
    >
      <uni-icons :type="show ? 'eye' : 'eye-slash'" :size="20" color="#888" />
    </view>
  </view>
</template>

<style scoped>
.pw-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.pw-input {
  flex: 1;
  /* 右侧给眼睛按钮留出空间，避免文本被遮挡 / right padding reserves room for eye button */
  padding: 0 80rpx 0 24rpx;
  height: 88rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 30rpx;
  background: #fff;
  box-sizing: border-box;
}
.pw-eye {
  position: absolute;
  right: 8rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-eye-active {
  /* 显示明文态视觉确认 / active state visual confirmation */
  background: #f0f0f0;
  border-radius: 32rpx;
}
.pw-eye-disabled {
  opacity: 0.3;
}
.pw-eye-hover {
  opacity: 0.6;
}
</style>