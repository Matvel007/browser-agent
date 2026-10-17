import { describe, expect, it } from 'vitest';
import { cleanStreamingContent, parseTextualToolCalls } from '../../src/services/llm';

const known = new Set(['devtools_evaluate_js', 'devtools_click_element']);
const D = '｜｜DSML｜｜';

describe('textual DSML tool calls', () => {
  it('parses a registered tool call with a string parameter', () => {
    const text = `Checking.\n<${D} calls><${D} invoke name="devtools_evaluate_js"><${D} parameter name="code" string="true">document.title</${D} parameter></${D} invoke></${D} calls>`;
    const parsed = parseTextualToolCalls(text, known);
    expect(parsed.calls).toEqual([{ name: 'devtools_evaluate_js', args: { code: 'document.title' } }]);
    expect(parsed.text).toBe('Checking.');
  });

  it('parses non-string parameters as JSON', () => {
    const text = `<${D} calls><${D} invoke name="devtools_click_element"><${D} parameter name="timeoutMs" string="false">500</${D} parameter></${D} invoke></${D} calls>`;
    expect(parseTextualToolCalls(text, known).calls[0].args).toEqual({ timeoutMs: 500 });
  });

  it('accepts any marker word between the separators', () => {
    const alt = '｜tool_calls｜';
    const text = `<${alt} invoke name="devtools_click_element"><${alt} parameter name="selector" string="true">#like</${alt} parameter></${alt} invoke>`;
    expect(parseTextualToolCalls(text, known).calls).toEqual([{ name: 'devtools_click_element', args: { selector: '#like' } }]);
  });

  it('accepts an empty marker between the separators', () => {
    const text = `<｜｜ invoke name="devtools_evaluate_js"><｜｜ parameter name="code" string="true">1</｜｜ parameter></｜｜ invoke>`;
    expect(parseTextualToolCalls(text, known).calls[0].name).toBe('devtools_evaluate_js');
  });

  it('ignores unknown tool names instead of executing them', () => {
    const text = `<${D} calls><${D} invoke name="shell_exec"><${D} parameter name="cmd" string="true">rm -rf /</${D} parameter></${D} invoke></${D} calls>`;
    const parsed = parseTextualToolCalls(text, known);
    expect(parsed.calls).toEqual([]);
  });

  it('parses the exact DeepSeek-style output seen in a real run', () => {
    const text = '<｜dsml｜ calls> <｜dsml｜ invoke name="devtools_scroll_into_view"> <｜dsml｜ parameter name="selector" string="true">segmented-like-dislike-button-view-model</｜dsml｜ parameter> </｜dsml｜ invoke> </｜dsml｜ calls>';
    const known2 = new Set(['devtools_scroll_into_view']);
    expect(parseTextualToolCalls(text, known2)).toEqual({ calls: [{ name: 'devtools_scroll_into_view', args: { selector: 'segmented-like-dislike-button-view-model' } }], text: '' });
  });

  it('leaves ordinary text untouched', () => {
    expect(parseTextualToolCalls('Plain answer', known)).toEqual({ calls: [], text: 'Plain answer' });
  });

  it('supports single quotes and attributes in arbitrary order', () => {
    const text = `<${D} invoke name='devtools_evaluate_js'><${D} parameter string='true' name='code'>console.log(1)</${D} parameter></${D} invoke>`;
    const parsed = parseTextualToolCalls(text, known);
    expect(parsed.calls).toEqual([{ name: 'devtools_evaluate_js', args: { code: 'console.log(1)' } }]);
    expect(parsed.text).toBe('');
  });

  it('cleans streaming content so raw DSML markup does not leak to UI', () => {
    const inProgress = `Analyzing.\n<${D} calls><${D} invoke name="devtools_evaluate_js"><${D} param`;
    expect(cleanStreamingContent(inProgress)).toBe('Analyzing.');
    const full = `Completed step.\n<${D} calls><${D} invoke name="devtools_evaluate_js"></${D} invoke></${D} calls>`;
    expect(cleanStreamingContent(full)).toBe('Completed step.');
  });
});
