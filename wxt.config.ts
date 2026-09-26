import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DeepSeek 划词翻译',
    description: '使用 DeepSeek 实时翻译英文划词，并保存到本地生词本进行复习。',
    version: '0.1.3',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['https://api.deepseek.com/*'],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    },
    action: {
      default_title: 'DeepSeek 划词翻译',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png'
      }
    },
    commands: {
      'translate-selection': {
        suggested_key: {
          default: 'Alt+Shift+T'
        },
        description: '翻译当前选中的英文文本'
      }
    }
  }
});
