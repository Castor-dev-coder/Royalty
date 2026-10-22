"""Apply the spacing and typography scale consistently across the stylesheet.

The earlier transformation matched a rule by its whole prelude, so any rule
preceded by a comment was skipped. That left the scale applied to some rules
and not others, which is why the interface looked inconsistent. This version
strips comments from the prelude before matching, so every rule is treated the
same way.

Each change is anchored to a selector and a property, and the result is
verified: the media-query count and the block count must not change, and the
stylesheet must stay balanced.
"""

import re
import sys

PATH = '/home/jeremy/Royalty/frontend/admin/src/styles.css'

# The scale itself.
EDITS = {
    # ---- navigation ---------------------------------------------------------
    '.sidebar': {'padding': 'var(--space-6) var(--space-3) var(--space-4)'},
    '.nav': {'gap': 'var(--space-1)', 'margin-top': 'var(--space-6)'},
    '.nav-link': {
        'gap': 'var(--space-3)',
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-snug)',
        'padding': 'var(--space-3)',
    },
    '.brand-wrap p': {'margin': 'var(--space-1) 0 0', 'font-size': 'var(--text-2xs)'},

    # ---- page header and containers ----------------------------------------
    '.content-panel': {'padding': 'var(--space-5) var(--space-6) var(--space-7)'},
    '.page-header': {'gap': 'var(--space-4)', 'padding': 'var(--space-5) 0 var(--space-4)'},
    '.page-header h2': {'font-size': 'var(--text-2xl)', 'line-height': 'var(--leading-tight)'},
    '.page-header p': {
        'margin': 'var(--space-2) 0 0',
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-normal)',
    },
    '.page-header-actions': {'gap': 'var(--space-3)'},
    '.route-content': {'padding': 'var(--space-5) var(--space-5) var(--space-6)'},

    # ---- cards, panels, statistics -----------------------------------------
    '.stats-grid': {'gap': 'var(--space-3)', 'margin-bottom': 'var(--space-4)'},
    '.stat-card': {'min-height': '96px', 'padding': 'var(--space-3) var(--space-4)'},
    '.stat-card span': {
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
        'margin-bottom': 'var(--space-2)',
    },
    '.stat-card strong': {'line-height': 'var(--leading-tight)'},
    '.stat-card small': {'font-size': 'var(--text-2xs)', 'margin-top': 'var(--space-1)'},
    '.panel': {'padding': 'var(--space-5) var(--space-5) var(--space-4)'},
    '.panel-header': {'gap': 'var(--space-3)', 'margin-bottom': 'var(--space-4)'},
    '.panel-header h3': {'font-size': 'var(--text-lg)', 'line-height': 'var(--leading-tight)'},
    '.panel-header span': {'font-size': 'var(--text-2xs)'},

    # ---- tables, filters, badges -------------------------------------------
    '.table-tools': {'gap': 'var(--space-2)'},
    'thead th': {
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
        'padding': '0 var(--space-3) var(--space-3)',
    },
    'tbody td': {
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-snug)',
        'padding': 'var(--space-3) var(--space-3)',
    },
    '.user-cell': {'gap': 'var(--space-3)'},
    '.user-cell small': {'font-size': 'var(--text-2xs)', 'line-height': 'var(--leading-snug)'},
    '.profile-card strong, .user-cell strong': {'font-size': 'var(--text-sm)'},
    '.profile-card span, .user-cell small': {'font-size': 'var(--text-2xs)'},
    '.role-badge, .status-badge, .status-pill, .chip-button': {
        'padding': 'var(--space-1) var(--space-2)',
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
    },
    '.link-button': {
        'padding': 'var(--space-1) var(--space-2)',
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
    },
    '.search-input': {'padding': 'var(--space-2) var(--space-3)', 'font-size': 'var(--text-sm)'},
    '.bar-group span': {'font-size': 'var(--text-2xs)'},
    '.bar-value': {'font-size': 'var(--text-2xs)'},
    '.empty-list': {'font-size': 'var(--text-sm)', 'line-height': 'var(--leading-normal)'},
    '.staff-row-actions': {'gap': 'var(--space-2)'},
    '.service-list': {'gap': 'var(--space-3)'},
    '.service-row': {'gap': 'var(--space-3)'},
    '.service-name': {'font-size': 'var(--text-sm)'},
    '.service-score': {'font-size': 'var(--text-sm)'},

    # ---- forms --------------------------------------------------------------
    '.field-label': {
        'margin': 'var(--space-4) 0 var(--space-2)',
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
    },
    '.modal-input': {
        'font-size': 'var(--text-md)',
        'font-weight': '400',
        'padding': 'var(--space-3) var(--space-4)',
    },
    '.form-grid': {'gap': 'var(--space-3)'},
    '.form-error': {
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-snug)',
        'margin': 'var(--space-3) 0 0',
    },
    '.form-hint': {'font-size': 'var(--text-sm)', 'line-height': 'var(--leading-snug)'},

    # ---- modals -------------------------------------------------------------
    '.modal-header': {
        'gap': 'var(--space-3)',
        'padding': 'var(--space-4) var(--modal-gutter) var(--space-3)',
    },
    '.modal-header h3': {'font-size': 'var(--text-xl)', 'line-height': 'var(--leading-tight)'},
    '.modal-subtitle': {
        'padding': 'var(--space-4) 0 var(--space-2)',
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-normal)',
    },
    '.modal-actions': {
        'gap': 'var(--space-3)',
        'margin': 'var(--space-5) calc(var(--modal-gutter) * -1) 0',
        'padding': 'var(--space-3) var(--modal-gutter) var(--space-4)',
    },
    '.confirm-modal > p, .result-modal > p': {
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-normal)',
    },

    # ---- appointment sidebar ----------------------------------------------
    '.appointment-layout': {
        'grid-template-columns': '320px minmax(0, 1fr)',
        'gap': 'var(--space-5)',
    },
    '.appointment-sidebar': {'padding': 'var(--space-5)', 'max-height': '640px'},
    '.sidebar-filters': {'gap': 'var(--space-2)', 'margin-bottom': 'var(--space-5)'},
    '.sidebar-filters button': {
        'padding': 'var(--space-2) var(--space-3)',
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
    },
    '.sidebar-status-section': {'margin-bottom': 'var(--space-5)'},
    '.sidebar-status-header': {
        'gap': 'var(--space-2)',
        'padding': '0 var(--space-1) var(--space-2)',
    },
    '.sidebar-status-count': {'font-size': 'var(--text-2xs)', 'line-height': 'var(--leading-snug)'},
    '.sidebar-appointment-item': {
        'gap': 'var(--space-3)',
        'padding': 'var(--space-3)',
        'margin-bottom': 'var(--space-2)',
    },
    '.sidebar-appointment-item strong': {
        'font-size': 'var(--text-sm)',
        'line-height': 'var(--leading-snug)',
    },
    '.sidebar-appointment-item small': {
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
        'margin-top': 'var(--space-1)',
    },

    # ---- login --------------------------------------------------------------
    '.login-field-label': {
        'margin': '0 0 var(--space-2)',
        'font-size': 'var(--text-2xs)',
        'line-height': 'var(--leading-snug)',
    },
    '.login-input': {
        'font-size': 'var(--text-md)',
        'font-weight': '400',
        'line-height': 'var(--leading-snug)',
        'padding': '0 var(--space-4)',
    },
    '.login-lede': {'font-size': 'var(--text-sm)', 'line-height': 'var(--leading-normal)'},
    '.login-demo-row': {'gap': 'var(--space-3)', 'font-size': 'var(--text-sm)'},
    '.login-demo-row dt': {'width': '5.2em'},
    '.login-demo-row dd': {'font-size': 'var(--text-xs)'},
    '.login-demo-list': {'gap': 'var(--space-1)'},
    '.login-demo-note': {'margin': 'var(--space-3) 0 0', 'font-size': 'var(--text-2xs)'},
}


def strip_comments(text):
    """Remove comments so a rule's prelude is just its selector."""
    return re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)


def find_blocks(text):
    """Return (start, end, prelude, body) for each top-level block.

    The prelude is returned with comments removed so the selector can be
    matched reliably.
    """
    blocks = []
    i = 0
    n = len(text)
    while i < n:
        brace = text.find('{', i)
        if brace == -1:
            break
        prelude = text[i:brace]
        depth = 1
        j = brace + 1
        while j < n and depth:
            if text[j] == '{':
                depth += 1
            elif text[j] == '}':
                depth -= 1
            j += 1
        blocks.append((i, j, text[i:brace], text[brace + 1:j - 1]))
        i = j
    return blocks


def selector_of(prelude):
    """The rule's selector, with comments and surrounding space removed."""
    return ' '.join(strip_comments(prelude).split())


def set_property(body, prop, value):
    """Set one property in a rule body. Returns (body, applied)."""
    pattern = re.compile(
        r'(^|;)(\s*)' + re.escape(prop) + r'\s*:\s*[^;{}]*;?',
        re.MULTILINE,
    )
    match = pattern.search(body)
    if not match:
        return body, False
    replacement = f'{match.group(1)}{match.group(2)}{prop}: {value};'
    return body[:match.start()] + replacement + body[match.end():], True


def has_property(body, prop):
    return re.search(r'(^|;|\n)\s*' + re.escape(prop) + r'\s*:', body, re.MULTILINE) is not None


def rewrite_rules(text, report, context):
    """Apply the property edits to every rule in a block of text."""
    out = []
    cursor = 0
    for start, end, prelude, body in find_blocks(text):
        selector = selector_of(prelude)
        if selector in EDITS:
            new_body = body
            for prop, value in EDITS[selector].items():
                new_body, applied = set_property(new_body, prop, value)
                if applied:
                    report.append((context, selector, prop, value))
                elif not has_property(new_body, prop):
                    new_body = new_body.rstrip() + f'\n  {prop}: {value};'
                    report.append((context, selector, prop, value + ' (added)'))
            brace = text.find('{', start)
            out.append(text[cursor:brace + 1])
            out.append(new_body)
            out.append('}')
            cursor = end
        else:
            out.append(text[cursor:end])
            cursor = end
    out.append(text[cursor:])
    return ''.join(out)


def rewrite_all(text, report):
    """Rewrite top-level rules and the rules inside every at-rule."""
    out = []
    cursor = 0
    for start, end, prelude, body in find_blocks(text):
        selector = selector_of(prelude)
        if selector.startswith('@'):
            # An at-rule: rewrite the rules inside it.
            brace = text.find('{', start)
            inner = rewrite_rules(body, report, selector)
            out.append(text[cursor:brace + 1])
            out.append(inner)
            out.append('}')
            cursor = end
        elif selector in EDITS:
            new_body = body
            for prop, value in EDITS[selector].items():
                new_body, applied = set_property(new_body, prop, value)
                if applied:
                    report.append(('top', selector, prop, value))
                elif not has_property(new_body, prop):
                    new_body = new_body.rstrip() + f'\n  {prop}: {value};'
                    report.append(('top', selector, prop, value + ' (added)'))
            brace = text.find('{', start)
            out.append(text[cursor:brace + 1])
            out.append(new_body)
            out.append('}')
            cursor = end
        else:
            out.append(text[cursor:end])
            cursor = end
    out.append(text[cursor:])
    return ''.join(out)


def main():
    with open(PATH, 'rb') as handle:
        raw = handle.read()
    bom = '\ufeff' if raw.startswith(b'\xef\xbb\xbf') else ''
    text = raw.decode('utf-8-sig')

    media_before = len(re.findall(r'@media', text))
    blocks_before = len(find_blocks(text))

    report = []
    text = rewrite_all(text, report)

    if len(re.findall(r'@media', text)) != media_before:
        print('ERROR: media query count changed')
        sys.exit(1)
    if len(find_blocks(text)) != blocks_before:
        print('ERROR: block count changed')
        sys.exit(1)
    if text.count('{') != text.count('}'):
        print('ERROR: unbalanced braces')
        sys.exit(1)

    with open(PATH, 'w', encoding='utf-8') as handle:
        handle.write(bom + text)

    touched = sorted({(ctx, sel) for ctx, sel, _, _ in report})
    print(f'applied {len(report)} property changes across {len(touched)} rules')
    missing = sorted(set(EDITS) - {sel for _, sel in touched})
    if missing:
        print('SELECTORS NOT FOUND IN THE STYLESHEET:')
        for sel in missing:
            print('  !', sel)


if __name__ == '__main__':
    main()
