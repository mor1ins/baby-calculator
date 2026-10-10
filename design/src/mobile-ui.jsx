import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { KonstaProvider, Button, Card, List, ListItem, ListInput, Segmented, SegmentedButton, Tabbar, TabbarLink } from 'konsta/react';

// The prototype keeps its existing scenario/state engine. This presentation adapter
// turns its templates into real React/Konsta components; document event delegation
// continues to handle the demo actions. No HTML from remote sources is accepted.
const roots = new Map();
const requestedPlatform = new URLSearchParams(location.search).get('platform');
let platform = requestedPlatform === 'ios' ? 'ios' : requestedPlatform === 'android' || /Android/i.test(navigator.userAgent) ? 'material' : 'ios';
document.documentElement.dataset.platform = platform;
document.documentElement.classList.add(platform);
const aliases = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', autocomplete: 'autoComplete', inputmode: 'inputMode', autofocus: 'autoFocus', rowspan: 'rowSpan', colspan: 'colSpan', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'aria-hidden': 'aria-hidden' };
const booleans = new Set(['disabled', 'required', 'multiple', 'hidden', 'open', 'readOnly', 'autoFocus']);
function attributes(node) {
  const props = {};
  for (const attr of node.attributes) {
    const name = aliases[attr.name] || attr.name;
    if (name === 'style') {
      props.style = {};
      for (const key of node.style) props.style[key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = node.style.getPropertyValue(key);
    } else if (name === 'value' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) props.defaultValue = attr.value;
    else if (name === 'checked') props.defaultChecked = true;
    else if (name !== 'selected') props[name] = booleans.has(name) ? true : attr.value;
  }
  return props;
}
function children(node) {
  const nodes = [...node.childNodes];
  const result = [];
  for (let index=0; index<nodes.length; index++) {
    const child=nodes[index];
    const input=child.nodeType === Node.ELEMENT_NODE && child.tagName === 'LABEL' && child.htmlFor ? child.nextElementSibling : null;
    if (!node.classList?.contains('schedule-field') && input && ['INPUT','TEXTAREA','SELECT'].includes(input.tagName) && input.id===child.htmlFor && !['checkbox','radio','hidden','file'].includes(input.type)) {
      const {id, className, style, ...props}=attributes(input);
      const type=input.tagName==='INPUT' ? input.type : input.tagName.toLowerCase();
      const defaultValue=type==='textarea' ? input.textContent : type==='select' ? input.querySelector('[selected]')?.value || input.querySelector('option')?.value : props.defaultValue;
      result.push(<div key={index} className="mobile-field"><label htmlFor={id}>{child.textContent}</label><ListInput {...props} component="div" inputId={id} type={type} defaultValue={defaultValue} inputClassName={className} inputStyle={style} outline={false} data-konsta="ListInput">{type==='select' ? children(input) : undefined}</ListInput></div>);
      index=nodes.indexOf(input);
    } else result.push(convert(child,index));
  }
  return result;
}
function convert(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  const props = { ...attributes(node), key };
  const has = (name) => node.classList.contains(name);
  if (has('settings-row')) {
    const text = node.querySelector('span');
    const subtitle = text?.querySelector('small')?.textContent;
    const title = [...(text?.childNodes || [])].filter(n => n.nodeName !== 'SMALL').map(n=>n.textContent).join('');
    const media = node.querySelector('svg');
    const { className, ...linkProps } = props;
    return <ListItem key={key} component="div" className="mobile-setting" link linkComponent="button" linkProps={{...linkProps, type:'button'}} title={title} subtitle={subtitle} media={media && convert(media, 'icon')} strongTitle={false} chevron={!node.hasAttribute('data-theme-choice')} after={node.getAttribute('aria-pressed') === 'true' ? <span aria-hidden="true">✓</span> : undefined} />;
  }
  if (has('preferences-card')) return <List {...props} strong inset={false} className="mobile-settings" data-konsta="List">{children(node)}</List>;
  if (has('insight-tabs')) return <Segmented {...props} strong rounded className="mobile-segmented insight-tabs" data-konsta="Segmented">{[...node.children].map((button,i)=><SegmentedButton {...attributes(button)} key={i} active={button.getAttribute('aria-pressed')==='true'}>{button.textContent}</SegmentedButton>)}</Segmented>;
  if (tag === 'button' && !has('wheel-option') && !node.closest('.calendar-grid, .compare-calendar-grid, .minute-wheel, .wheel-track')) {
    if (has('primary') || has('outline-button') || has('text-button') || has('icon-button') || node.parentElement?.classList.contains('chips')) {
      return <Button {...props} rounded data-konsta="Button" className={`${props.className || ''} mobile-button ${has('icon-button') ? 'mobile-icon' : ''}`} large={has('primary')} outline={has('outline-button')} clear={has('text-button') || has('icon-button')} tonal={node.parentElement?.classList.contains('chips') && node.getAttribute('aria-pressed')!=='true'} inline={!has('primary') && !has('outline-button')} type={props.type || 'button'}>{children(node)}</Button>;
    }
  }
  if (has('card') || has('report-metric')) return <Card {...props} component={tag} contentWrap={false} data-konsta="Card" className={`${props.className} mobile-card`} >{children(node)}</Card>;
  if (tag === 'textarea') return React.createElement(tag, {...props, defaultValue:node.textContent});
  if (tag === 'select') props.defaultValue = node.querySelector('[selected]')?.value || node.querySelector('option')?.value;
  const voidTags = new Set(['input','img','br','hr','source','wbr','area','col','embed','link','meta','param','track']);
  return React.createElement(tag, props, ...(voidTags.has(tag) ? [] : children(node)));
}
function parse(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}
function draw(entry) {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.classList.toggle('dark',dark);
  flushSync(() => entry.root.render(<KonstaProvider theme={platform} dark={dark} autoThemeDetection={false}><React.Fragment key={entry.version}>{entry.tree}</React.Fragment></KonstaProvider>));
}
window.mobileUI = {
  render(element, html) {
    // The profile owns a temporary preview control; release it before replacing the page.
    if (element.id === 'screen') {
      const slot = element.querySelector('#profile-platform-switcher');
      const control = roots.get(slot);
      if (control) { control.root.unmount(); roots.delete(slot); }
    }
    let entry = roots.get(element);
    if (!entry) { entry = {root:createRoot(element), version:0}; roots.set(element,entry); }
    entry.version++;
    const fragment = parse(html);
    entry.tree = element.id === 'navigation' ? <Tabbar className="mobile-tabbar" innerClassName="mobile-tabbar-inner" icons labels data-konsta="Tabbar">{[...fragment.children].map((button,i)=><TabbarLink {...attributes(button)} key={i} component="button" type="button" role="button" active={button.hasAttribute('aria-current')} icon={convert(button.querySelector('svg'),'icon')} label={button.textContent} />)}</Tabbar> : children(fragment);
    draw(entry);
  },
  refreshTheme() {
    document.documentElement.classList.toggle('dark',document.documentElement.dataset.theme==='dark');
    for (const [element,entry] of roots) if (element.isConnected) draw(entry);
  }
};
window.mobileUI.refreshTheme();

function setPlatform(next) {
  platform = next;
  document.documentElement.dataset.platform = next;
  document.documentElement.classList.remove('ios', 'material');
  document.documentElement.classList.add(next);
  const url = new URL(location.href);
  url.searchParams.set('platform', next === 'material' ? 'android' : 'ios');
  history.replaceState(null, '', url);
  window.mobileUI.refreshTheme();
}
function mountPlatformSwitcher(switcher) {
  if (!switcher || roots.has(switcher)) return;
  const entry = {
    root: createRoot(switcher), version: 0,
    get tree() {
      return <Segmented strong rounded role="group" aria-label="Платформа макета" className="platform-control">
        <SegmentedButton type="button" active={platform === 'ios'} aria-pressed={platform === 'ios'} onClick={() => setPlatform('ios')}>iOS</SegmentedButton>
        <SegmentedButton type="button" active={platform === 'material'} aria-pressed={platform === 'material'} onClick={() => setPlatform('material')}>Android</SegmentedButton>
      </Segmented>;
    }
  };
  roots.set(switcher, entry);
  draw(entry);
}

window.mobileUI.mountPlatformSwitcher = mountPlatformSwitcher;
mountPlatformSwitcher(document.getElementById('platform-switcher'));
