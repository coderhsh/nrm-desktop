import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.stubGlobal('ElMessage', {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
})

const appUpdateState = vi.hoisted(() => ({
  updateInfo: { value: null as null | {
    currentVersion: string
    version: string
    date: string
    body: string
  } },
  checking: { value: false },
  downloading: { value: false },
  installing: { value: false },
  downloaded: { value: false },
  dialogVisible: { value: false },
  downloadProgress: { value: null as number | null },
  downloadStatusText: { value: '0 B' },
  hasUpdate: { value: false },
  showIndicator: { value: false },
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installAndRestart: vi.fn(),
  dismissCurrentUpdate: vi.fn(),
  closeUpdateDialog: vi.fn(),
  openUpdateDialog: vi.fn(),
}))

vi.mock('@/composables/useAppUpdate', () => ({
  formatUpdateError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  useAppUpdate: () => appUpdateState,
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    language: { value: 'zh-CN' as const },
    t: (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
        'app.update.availableTitle': '发现新版本',
        'app.update.readyTitle': '更新已下载',
        'app.update.currentVersion': '当前版本',
        'app.update.newVersion': '新版本',
        'app.update.publishDate': `发布时间：${params?.date ?? ''}`,
        'app.update.releaseNotes': '更新日志',
        'app.update.noReleaseNotes': '该版本未提供更新日志。',
        'app.update.downloadProgress': '下载进度',
        'app.update.downloadAndInstall': '下载更新',
        'app.update.installAndRestart': '重启并更新',
        'app.update.restartLater': '稍后重启',
        'app.update.readyHint': '更新包已就绪，可立即重启安装，或选择稍后手动重启。',
        'app.update.restartLaterHint': '更新包已就绪，可在设置中点击「检查更新」随时重启安装。',
        'common.cancel': '取消',
      }
      return map[key] ?? key
    },
  }),
}))

import AppUpdateDialog from './AppUpdateDialog.vue'

describe('AppUpdateDialog', () => {
  beforeEach(() => {
    appUpdateState.updateInfo.value = {
      currentVersion: '1.0.1',
      version: '1.0.2',
      date: '2026-05-22T00:00:00.000Z',
      body: 'Release notes',
    }
    appUpdateState.checking.value = false
    appUpdateState.downloading.value = false
    appUpdateState.installing.value = false
    appUpdateState.downloaded.value = false
    appUpdateState.dialogVisible.value = true
    appUpdateState.downloadProgress.value = null
    appUpdateState.downloadStatusText.value = '0 B'
    appUpdateState.hasUpdate.value = true
    appUpdateState.showIndicator.value = true
  })

  it('renders markdown release notes as read-only content', () => {
    appUpdateState.updateInfo.value = {
      currentVersion: '1.0.1',
      version: '1.0.2',
      date: '2026-05-22T00:00:00.000Z',
      body: '## Changed\n\n- **Bold item**',
    }

    const wrapper = mount(AppUpdateDialog, {
      global: {
        stubs: {
          ElDialog: {
            template: '<div><slot /><slot name="footer" /></div>',
          },
          ElButton: {
            template: '<button><slot /></button>',
          },
          ElProgress: true,
        },
      },
    })

    expect(wrapper.find('.app-update-notes-content').exists()).toBe(true)
    expect(wrapper.find('.app-update-notes-content pre').exists()).toBe(false)
    expect(wrapper.find('.app-update-notes-content').html()).toContain('<strong>Bold item</strong>')
  })

  it('renders version info and download action when an update is available', () => {
    const wrapper = mount(AppUpdateDialog, {
      global: {
        stubs: {
          ElDialog: {
            template: '<div><slot /><slot name="footer" /></div>',
          },
          ElButton: {
            template: '<button><slot /></button>',
          },
          ElProgress: true,
        },
      },
    })

    expect(wrapper.text()).toContain('1.0.1')
    expect(wrapper.text()).toContain('1.0.2')
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('22')
    expect(wrapper.text()).toContain('Release notes')
    expect(wrapper.text()).toContain('下载更新')
  })

  it('shows install action and progress after download completes', async () => {
    appUpdateState.downloaded.value = true
    appUpdateState.downloadProgress.value = 100
    appUpdateState.downloadStatusText.value = '10 B / 10 B'

    const wrapper = mount(AppUpdateDialog, {
      global: {
        stubs: {
          ElDialog: {
            template: '<div><slot /><slot name="footer" /></div>',
          },
          ElButton: {
            template: '<button><slot /></button>',
          },
          ElProgress: true,
        },
      },
    })

    expect(wrapper.text()).toContain('重启并更新')
    expect(wrapper.text()).toContain('稍后重启')
    expect(wrapper.text()).toContain('更新包已就绪')
    expect(wrapper.text()).toContain('10 B / 10 B')
  })

  it('offers restart later without dismissing the downloaded update', async () => {
    appUpdateState.downloaded.value = true

    const wrapper = mount(AppUpdateDialog, {
      global: {
        stubs: {
          ElDialog: {
            template: '<div><slot /><slot name="footer" /></div>',
          },
          ElButton: {
            template: '<button @click="$attrs.onClick"><slot /></button>',
          },
          ElProgress: true,
        },
      },
    })

    await wrapper.find('button').trigger('click')

    expect(appUpdateState.closeUpdateDialog).toHaveBeenCalledOnce()
    expect(appUpdateState.dismissCurrentUpdate).not.toHaveBeenCalled()
  })
})
