/**
 * CSS 样式修复增量测试
 * 覆盖：主题变量完整性、编辑器/工具页硬编码消除、app.css 变量化
 */
const fs = require('fs');
const path = require('path');

const CSS_DIR = path.join(__dirname, '..', '..', 'public', 'css');

function readCss(name) {
  return fs.readFileSync(path.join(CSS_DIR, name), 'utf8');
}

function extractVarNames(css) {
  const re = /--([\w-]+)\s*:/g;
  const names = new Set();
  let m;
  while ((m = re.exec(css)) !== null) names.add('--' + m[1]);
  return names;
}

function findHexColors(css) {
  const re = /(?:color|background|border|fill|outline|box-shadow|background-color)\s*:[^;]*#([0-9a-fA-F]{3,8})(?!\s*;|\s*$)/gi;
  const results = [];
  let m;
  while ((m = re.exec(css)) !== null) {
    results.push({ hex: '#' + m[1], pos: m.index, context: css.substring(Math.max(0, m.index - 80), m.index + m[0].length + 40) });
  }
  return results;
}

// ========== 主题变量完整性 ==========
describe('主题变量体系完整性', () => {
  const THEMES = ['theme-1688.css', 'theme-jd.css', 'theme-fresh.css'];
  const REQUIRED_VARS = [
    '--bg-base', '--bg-surface', '--bg-elevated', '--bg-hover',
    '--border', '--border-subtle',
    '--text-primary', '--text-secondary', '--text-muted',
    '--accent', '--accent-hover', '--accent-subtle', '--accent-glow', '--accent-gradient',
    '--success', '--success-bg', '--danger', '--danger-bg', '--info', '--info-bg',
    '--radius-xs', '--radius-sm', '--radius', '--radius-lg', '--radius-xl',
    '--shadow', '--shadow-hover', '--shadow-accent',
    '--transition',
    '--editor-bg', '--editor-bg-panel', '--editor-border', '--editor-border-subtle',
    '--editor-text', '--editor-text-muted', '--editor-accent', '--editor-accent-hover',
    '--editor-hover-bg', '--editor-active-bg', '--editor-canvas-bg', '--editor-canvas-checker',
    '--editor-overlay'
  ];

  THEMES.forEach(theme => {
    describe(theme, () => {
      let css;
      let vars;
      beforeAll(() => {
        css = readCss(theme);
        vars = extractVarNames(css);
      });

      test('包含所有必需的基础变量', () => {
        const missing = REQUIRED_VARS.filter(v => !vars.has(v));
        expect(missing).toEqual([]);
      });

      test('radius 变量值递增', () => {
        const getVal = (name) => {
          const m = css.match(new RegExp(name + '\\s*:\\s*(\\d+)px'));
          return m ? parseInt(m[1]) : 0;
        };
        const xs = getVal('--radius-xs');
        const sm = getVal('--radius-sm');
        const r = getVal('--radius');
        const lg = getVal('--radius-lg');
        const xl = getVal('--radius-xl');
        expect(xs).toBeLessThan(sm);
        expect(sm).toBeLessThan(r);
        expect(r).toBeLessThan(lg);
        expect(lg).toBeLessThan(xl);
      });

      test('editor 变量形成完整暗色体系', () => {
        const getVal = (name) => {
          const m = css.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;]+)'));
          return m ? m[1].trim() : '';
        };
        expect(getVal('--editor-bg')).toBeTruthy();
        expect(getVal('--editor-text')).toBeTruthy();
        expect(getVal('--editor-accent')).toBeTruthy();
      });
    });
  });

  test('三个主题变量名集合完全一致', () => {
    const sets = THEMES.map(t => extractVarNames(readCss(t)));
    const base = sets[0];
    for (let i = 1; i < sets.length; i++) {
      const missing = [...base].filter(v => !sets[i].has(v));
      const extra = [...sets[i]].filter(v => !base.has(v));
      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    }
  });
});

// ========== meitu-editor.css 硬编码检测 ==========
describe('meitu-editor.css — 硬编码色值消除', () => {
  let css;
  beforeAll(() => { css = readCss('meitu-editor.css'); });

  test('不包含硬编码 hex 色值（排除 rgba 和 #fff 在特殊场景）', () => {
    const lines = css.split('\n');
    const violations = [];
    const hexRe = /#([0-9a-fA-F]{3,8})\b/g;

    lines.forEach((line, idx) => {
      if (line.trim().startsWith('/*') || line.trim().startsWith('*')) return;
      let m;
      while ((m = hexRe.exec(line)) !== null) {
        const hex = m[1].toLowerCase();
        if (hex === 'fff' || hex === 'ffffff') return;
        violations.push({ line: idx + 1, hex: '#' + hex, text: line.trim() });
      }
    });
    expect(violations).toEqual([]);
  });

  test('主要颜色声明使用 var(--editor-*) 变量', () => {
    const editorVarCount = (css.match(/var\(--editor-/g) || []).length;
    expect(editorVarCount).toBeGreaterThanOrEqual(15);
  });

  test('background/color 属性不使用裸 hex 值', () => {
    const lines = css.split('\n');
    const bareHex = lines.filter(l =>
      /(?:background|color)\s*:\s*#[0-9a-fA-F]{3,8}/.test(l) &&
      !/var\(/.test(l) &&
      !/#fff/i.test(l)
    );
    expect(bareHex).toEqual([]);
  });
});

// ========== meitu-tools.css 硬编码检测 ==========
describe('meitu-tools.css — 硬编码色值消除', () => {
  let css;
  beforeAll(() => { css = readCss('meitu-tools.css'); });

  test('背景色使用 var(--bg-*) 变量', () => {
    const lines = css.split('\n');
    const bareBgHex = lines.filter(l =>
      /background\s*:\s*#[0-9a-fA-F]{3,8}/.test(l) &&
      !/var\(/.test(l) &&
      !/rgba?\(/.test(l) &&
      !/linear-gradient/.test(l)
    );
    expect(bareBgHex).toEqual([]);
  });

  test('文字色使用 var(--text-*) 变量', () => {
    const lines = css.split('\n');
    const bareColorHex = lines.filter(l =>
      /(?:^|[^-])color\s*:\s*#[0-9a-fA-F]{3,8}/.test(l) &&
      !/var\(/.test(l) &&
      !/#fff/i.test(l)
    );
    expect(bareColorHex).toEqual([]);
  });

  test('边框色使用 var(--border*) 变量', () => {
    const lines = css.split('\n');
    const bareBorderHex = lines.filter(l =>
      /border(?:-(?:left|right|top|bottom))?\s*:\s*[^;]*#[0-9a-fA-F]{3,8}/.test(l) &&
      !/var\(/.test(l) &&
      !/rgba?\(/.test(l)
    );
    expect(bareBorderHex).toEqual([]);
  });

  test('accent 色使用 var(--accent) 变量', () => {
    const accentVarCount = (css.match(/var\(--accent/g) || []).length;
    expect(accentVarCount).toBeGreaterThanOrEqual(20);
  });

  test('danger 色使用 var(--danger) 变量', () => {
    const dangerVarCount = (css.match(/var\(--danger/g) || []).length;
    expect(dangerVarCount).toBeGreaterThanOrEqual(3);
  });
});

// ========== app.css 关键组件变量化 ==========
describe('app.css — 关键组件样式变量化', () => {
  let css;
  beforeAll(() => { css = readCss('app.css'); });

  test('status-unused 使用 success 变量', () => {
    const block = css.match(/\.status-unused\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--success');
    expect(block).not.toContain('#52c41a');
    expect(block).not.toContain('#f6ffed');
  });

  test('status-used 使用 danger 变量', () => {
    const block = css.match(/\.status-used\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--danger');
    expect(block).not.toContain('#ff7875');
    expect(block).not.toContain('#ffccc7');
  });

  test('status-dot 使用 success 变量', () => {
    const block = css.match(/\.status-dot\.unused::before\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--success)');
    expect(block).not.toContain('#52c41a');
  });

  test('action-bar-left strong 使用 accent 变量', () => {
    const block = css.match(/\.action-bar-left strong\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent)');
  });

  test('info-grid link 使用 accent 变量', () => {
    const block = css.match(/\.info-grid \.value a\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent)');
  });

  test('detail-img-tab active 使用 accent 变量', () => {
    const block = css.match(/\.detail-img-tab\.active\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent)');
  });

  test('cell-copy-icon hover 使用 accent 变量', () => {
    const block = css.match(/\.cell-copy-icon:hover\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent)');
  });

  test('th-action 使用 accent 变量', () => {
    const block = css.match(/\.th-action\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent)');
  });

  test('sku-row-checked 使用 accent-subtle 变量', () => {
    const block = css.match(/\.sku-row-checked td\s*\{[^}]+\}/)?.[0] || '';
    expect(block).toContain('var(--accent-subtle)');
    expect(block).not.toContain('#f0f7ff');
  });

  test('service-status 使用 success/danger 变量', () => {
    const toolsCss = readCss('meitu-tools.css');
    const okBlock = toolsCss.match(/\.service-status\.ok\s*\{[^}]+\}/)?.[0] || '';
    const errBlock = toolsCss.match(/\.service-status\.err\s*\{[^}]+\}/)?.[0] || '';
    expect(okBlock).toContain('var(--success)');
    expect(errBlock).toContain('var(--danger)');
  });
});

// ========== 跨文件一致性 ==========
describe('跨文件 CSS 变量引用一致性', () => {
  test('meitu-editor.css 引用的变量在所有主题中都有定义', () => {
    const editorCss = readCss('meitu-editor.css');
    const editorVars = new Set();
    const re = /var\(--([\w-]+)\)/g;
    let m;
    while ((m = re.exec(editorCss)) !== null) editorVars.add('--' + m[1]);

    const themeVars = extractVarNames(readCss('theme-1688.css'));
    const missing = [...editorVars].filter(v => !themeVars.has(v));
    expect(missing).toEqual([]);
  });

  test('meitu-tools.css 引用的变量在所有主题中都有定义', () => {
    const toolsCss = readCss('meitu-tools.css');
    const toolsVars = new Set();
    const re = /var\(--([\w-]+)\)/g;
    let m;
    while ((m = re.exec(toolsCss)) !== null) toolsVars.add('--' + m[1]);

    const themeVars = extractVarNames(readCss('theme-1688.css'));
    const missing = [...toolsVars].filter(v => !themeVars.has(v));
    expect(missing).toEqual([]);
  });

  test('app.css 引用的变量在所有主题中都有定义', () => {
    const appCss = readCss('app.css');
    const appVars = new Set();
    const re = /var\(--([\w-]+)\)/g;
    let m;
    while ((m = re.exec(appCss)) !== null) appVars.add('--' + m[1]);

    const themeVars = extractVarNames(readCss('theme-1688.css'));
    const missing = [...appVars].filter(v => !themeVars.has(v));
    expect(missing).toEqual([]);
  });
});
