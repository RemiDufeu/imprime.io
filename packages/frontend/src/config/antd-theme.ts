import type { ThemeConfig } from 'antd'

const colorPrimary = '#4f46e5'
const shadow = '0 2px 4px 0 rgba(0, 0, 0, 0.1)'

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colorPrimary,
    colorPrimaryBg: '#e0e7ff',
    colorPrimaryBgHover: '#c7d2fe',
    colorPrimaryBorder: '#a5b4fc',
    colorSuccess: '#13815dff',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',

    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyCode: '"Courier Prime", "Courier New", monospace',
    fontSize: 14,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,

    borderRadius: 8,

    padding: 16,
    margin: 16,

    colorBgContainer: '#ffffff',
    colorBgLayout: '#fbfbf8ff',

    boxShadow: shadow,
  },
  components: {
    Button: {
      controlHeight: 36,
      fontSize: 14,
      borderRadius: 6,
      defaultShadow: shadow,
      primaryShadow: shadow,
    },
    Input: {
      controlHeight: 36,
      fontSize: 14,
      borderRadius: 6,
    },
    Card: {
      borderRadiusLG: 12,
      boxShadow: shadow,
    },
    Typography: {
      titleMarginTop: 0,
    },
    Layout: {
      headerBg: 'transparent',
      headerHeight: 64,
      headerPadding: 16,
      headerColor: colorPrimary,
    },
  },
}
