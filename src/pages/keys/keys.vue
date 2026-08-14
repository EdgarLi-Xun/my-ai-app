<script setup lang="ts">
/**
 * API Key 管理页 / API Key management page
 *
 * 列表 + 新建 + 编辑 + 删除 + 设为默认。读取后端 /api/providers 厂家下拉。
 * List + create + edit + delete + set default. Provider dropdown from /api/providers.
 */
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { ProviderVo, UserApiKeyVo, UserApiKeyDto } from '@myai/sdk';
import { getSdk, sdkState } from '@/sdk';

const keys = ref<UserApiKeyVo[]>([]);
const providers = ref<ProviderVo[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const showForm = ref(false);
const editingId = ref<number | null>(null);

const form = ref({
  name: '',
  provider: '',
  protocol: '',
  apiKey: '',
  baseUrl: '',
  modelName: '',
  enabled: true,
});

const userId = computed<number>(() => sdkState.currentUser?.id ?? 0);

async function load() {
  if (!userId.value) {
    uni.reLaunch({ url: '/pages/login/login' });
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const { userApiKeyApi, providerApi } = getSdk();
    [keys.value, providers.value] = await Promise.all([
      userApiKeyApi.list(userId.value),
      providerApi.list().catch(() => [] as ProviderVo[]),
    ]);
  } catch (err: unknown) {
    const e = err as { message?: string };
    errorMsg.value = e.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  if (showForm.value) return;
  load();
});

function openCreate() {
  editingId.value = null;
  form.value = {
    name: '',
    provider: providers.value[0]?.name ?? '',
    protocol: '',
    apiKey: '',
    baseUrl: '',
    modelName: '',
    enabled: true,
  };
  showForm.value = true;
}

function openEdit(k: UserApiKeyVo) {
  editingId.value = k.id;
  form.value = {
    name: k.name,
    provider: k.provider,
    protocol: k.protocol ?? '',
    apiKey: '', // 空字符串 = 保留原值
    baseUrl: k.baseUrl,
    modelName: k.modelName,
    enabled: k.enabled,
  };
  showForm.value = true;
}

async function onSubmit() {
  if (!userId.value) return;
  const dto: UserApiKeyDto = {
    name: form.value.name.trim(),
    provider: form.value.provider,
    protocol: form.value.protocol ? (form.value.protocol as UserApiKeyDto['protocol']) : undefined,
    apiKey: form.value.apiKey || undefined,
    baseUrl: form.value.baseUrl || undefined,
    modelName: form.value.modelName,
    enabled: form.value.enabled,
  };
  loading.value = true;
  try {
    const { userApiKeyApi } = getSdk();
    if (editingId.value !== null) {
      await userApiKeyApi.update(userId.value, editingId.value, dto);
      uni.showToast({ title: '已更新', icon: 'success' });
    } else {
      await userApiKeyApi.create(userId.value, dto);
      uni.showToast({ title: '已新建', icon: 'success' });
    }
    showForm.value = false;
    await load();
  } catch (err: unknown) {
    const e = err as { message?: string };
    uni.showToast({ title: e.message ?? '保存失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function onDelete(k: UserApiKeyVo) {
  const yes = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除确认',
      content: `确认删除 Key "${k.name}"？`,
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!yes) return;
  try {
    const { userApiKeyApi } = getSdk();
    await userApiKeyApi.delete(userId.value, k.id);
    uni.showToast({ title: '已删除', icon: 'success' });
    await load();
  } catch (err: unknown) {
    const e = err as { message?: string };
    uni.showToast({ title: e.message ?? '删除失败', icon: 'none' });
  }
}

async function onSetDefault(k: UserApiKeyVo) {
  try {
    const { userApiKeyApi } = getSdk();
    await userApiKeyApi.setDefault(userId.value, k.id);
    uni.showToast({ title: '已设为默认', icon: 'success' });
    await load();
  } catch (err: unknown) {
    const e = err as { message?: string };
    uni.showToast({ title: e.message ?? '设置失败', icon: 'none' });
  }
}

// Picker event handlers (named to avoid inline TS in template)
function onPickProvider(e: unknown) {
  const idx = Number((e as { detail?: { value?: unknown } } | undefined)?.detail?.value ?? -1);
  const p = providers.value[idx];
  if (p) form.value.provider = p.name;
}
function onPickProtocol(e: unknown) {
  const idx = Number((e as { detail?: { value?: unknown } } | undefined)?.detail?.value ?? 0);
  form.value.protocol = ['', 'OPENAI_COMPATIBLE', 'OLLAMA', 'ANTHROPIC'][idx] || '';
}
function onToggleEnabled(e: unknown) {
  form.value.enabled = Boolean((e as { detail?: { value?: unknown } } | undefined)?.detail?.value);
}
</script>

<template>
  <view class="page">
    <view v-if="!showForm" class="list-view">
      <view class="topbar">
        <text class="topbar-title">API Key</text>
        <text class="add-btn" @click="openCreate">+ 新建</text>
      </view>

      <view v-if="loading && keys.length === 0" class="state">加载中…</view>
      <view v-else-if="errorMsg" class="state error">{{ errorMsg }}</view>
      <view v-else-if="keys.length === 0" class="state empty">
        <text>暂无 Key</text>
        <text class="empty-hint">点击右上角"新建"添加</text>
      </view>

      <view v-for="k in keys" :key="k.id" class="card">
        <view class="card-header">
          <text class="card-name">{{ k.name }}</text>
          <text v-if="k.defaultKey" class="badge-default">默认</text>
        </view>
        <view class="card-row"><text class="card-label">厂家</text><text class="card-value">{{ k.provider }} ({{ k.protocol }})</text></view>
        <view class="card-row"><text class="card-label">模型</text><text class="card-value">{{ k.modelName }}</text></view>
        <view class="card-row"><text class="card-label">baseUrl</text><text class="card-value">{{ k.baseUrl }}</text></view>
        <view class="card-row"><text class="card-label">API Key</text><text class="card-value">{{ k.maskedApiKey }}</text></view>
        <view class="card-row"><text class="card-label">状态</text><text class="card-value">{{ k.enabled ? '启用' : '禁用' }}</text></view>
        <view class="card-actions">
          <button class="btn-sm" @click="openEdit(k)">编辑</button>
          <button v-if="!k.defaultKey" class="btn-sm" @click="onSetDefault(k)">设为默认</button>
          <button class="btn-sm btn-danger" @click="onDelete(k)">删除</button>
        </view>
      </view>
    </view>

    <view v-else class="form-view">
      <view class="topbar">
        <text class="topbar-title">{{ editingId !== null ? '编辑 Key' : '新建 Key' }}</text>
        <text class="add-btn" @click="showForm = false">取消</text>
      </view>

      <view class="form">
        <view class="form-item">
          <text class="label">别名</text>
          <input v-model="form.name" class="input" placeholder="工作 / 个人" />
        </view>

        <view class="form-item">
          <text class="label">厂家</text>
          <picker
            :value="providers.findIndex((p) => p.name === form.provider)"
            :range="providers"
            range-key="displayName"
            @change="onPickProvider"
          >
            <view class="picker">{{ providers.find((p) => p.name === form.provider)?.displayName || '请选择' }}</view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">协议（留空用默认）</text>
          <picker
            :range="['', 'OPENAI_COMPATIBLE', 'OLLAMA', 'ANTHROPIC']"
            @change="onPickProtocol"
          >
            <view class="picker">{{ form.protocol || '默认' }}</view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">API Key{{ editingId !== null ? '（留空保留原值）' : '' }}</text>
          <input v-model="form.apiKey" class="input" type="password" :placeholder="editingId !== null ? '留空保留原值' : 'sk-...'" />
        </view>

        <view class="form-item">
          <text class="label">baseUrl（可选）</text>
          <input v-model="form.baseUrl" class="input" placeholder="https://api.example.com" />
        </view>

        <view class="form-item">
          <text class="label">模型名</text>
          <input v-model="form.modelName" class="input" placeholder="gpt-4o-mini" />
        </view>

        <view class="form-item">
          <text class="label">启用</text>
          <switch :checked="form.enabled" @change="onToggleEnabled" />
        </view>

        <button class="btn-primary" :disabled="loading || !form.name || !form.provider || !form.modelName" @click="onSubmit">
          {{ editingId !== null ? '保存' : '创建' }}
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #fafafa;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background: #fff;
  border-bottom: 2rpx solid #eee;
}
.topbar-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}
.add-btn {
  color: #667eea;
  font-size: 30rpx;
}
.state {
  padding: 64rpx 32rpx;
  text-align: center;
  color: #888;
}
.state.error {
  color: #dd524d;
}
.state.empty {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.empty-hint {
  font-size: 24rpx;
  color: #aaa;
}
.card {
  margin: 24rpx 32rpx;
  padding: 24rpx;
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.04);
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.card-name {
  font-size: 32rpx;
  font-weight: 500;
  color: #333;
}
.badge-default {
  background: #667eea;
  color: #fff;
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
}
.card-row {
  display: flex;
  padding: 8rpx 0;
  font-size: 26rpx;
}
.card-label {
  color: #888;
  width: 128rpx;
}
.card-value {
  color: #333;
  flex: 1;
  word-break: break-all;
}
.card-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 2rpx solid #f5f5f5;
}
.btn-sm {
  flex: 1;
  height: 64rpx;
  line-height: 64rpx;
  font-size: 26rpx;
  background: #f5f5f5;
  color: #555;
  border-radius: 6rpx;
  margin: 0;
}
.btn-danger {
  background: #ffeaea;
  color: #dd524d;
}
.form {
  padding: 32rpx;
}
.form-item {
  margin-bottom: 24rpx;
}
.label {
  font-size: 26rpx;
  color: #555;
  display: block;
  margin-bottom: 8rpx;
}
.input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 28rpx;
  background: #fff;
  box-sizing: border-box;
}
.picker {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 28rpx;
  background: #fff;
  box-sizing: border-box;
}
.btn-primary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 24rpx;
}
.btn-primary:disabled {
  background: #b0b8e8;
}
</style>