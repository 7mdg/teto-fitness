import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from './icons';

type ButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  full?: boolean;
  icon?: IconName;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function Button({ variant = 'secondary', full, icon, children, class: cls, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} class={`btn ${variant} ${full ? 'full' : ''} ${(cls as string) ?? ''}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function TopBar(props: { title?: string; onBack?: () => void; right?: ComponentChildren; brand?: boolean }) {
  return (
    <header class="topbar">
      <div class="topbar-side">
        {props.onBack && (
          <button type="button" class="icon-btn" onClick={props.onBack} aria-label="Back">
            <Icon name="back" size={22} />
          </button>
        )}
        {props.brand && <span class="wordmark">T.E.T.O.</span>}
      </div>
      {props.title ? <h1 class="topbar-title">{props.title}</h1> : <span />}
      <div class="topbar-side right">{props.right}</div>
    </header>
  );
}

export function Section(props: { title?: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="section">
      {(props.title || props.action) && (
        <div class="section-head">
          {props.title && <h2 class="section-title">{props.title}</h2>}
          {props.action}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Card(props: { children: ComponentChildren; class?: string }) {
  return <div class={`card ${props.class ?? ''}`}>{props.children}</div>;
}

export function Row(props: {
  title: ComponentChildren;
  detail?: ComponentChildren;
  trailing?: ComponentChildren;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const inner = (
    <>
      <span class="row-main">
        <span class="row-title">{props.title}</span>
        {props.detail && <span class="row-detail">{props.detail}</span>}
      </span>
      {props.trailing && <span class="row-trailing">{props.trailing}</span>}
      {props.chevron && <Icon name="chevron" size={18} class="row-chevron" />}
    </>
  );
  return props.onClick ? (
    <button type="button" class="row" onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <div class="row">{inner}</div>
  );
}

/** iOS-style switch (native `switch` checkbox on Safari 17.4+, which also gives haptic feedback). */
export function Toggle(props: { label: string; detail?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="row toggle-row">
      <span class="row-main">
        <span class="row-title">{props.label}</span>
        {props.detail && <span class="row-detail">{props.detail}</span>}
      </span>
      <input
        type="checkbox"
        {...{ switch: true }}
        class="switch"
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
    </label>
  );
}

export function Tag(props: { children: ComponentChildren; tone?: 'acc' | 'lime' | 'mut' | 'danger' }) {
  return <span class={`tag ${props.tone ?? 'mut'}`}>{props.children}</span>;
}

export function Dialog(props: { open: boolean; title: string; children?: ComponentChildren; actions: ComponentChildren; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog ref={ref} class="dialog" onClose={props.onClose} onCancel={props.onClose}>
      <h2 class="dialog-title">{props.title}</h2>
      {props.children && <div class="dialog-body">{props.children}</div>}
      <div class="dialog-actions">{props.actions}</div>
    </dialog>
  );
}

export function Toast(props: { message: string | null }) {
  if (!props.message) return null;
  return (
    <div class="toast" role="status">
      <Icon name="check" size={18} />
      {props.message}
    </div>
  );
}
