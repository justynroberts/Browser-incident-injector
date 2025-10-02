#!/usr/bin/env python3
"""
Scope all CSS selectors to .incident-injector-panel to prevent CSS bleeding
"""
import re

def scope_css_selector(selector):
    """Add .incident-injector-panel prefix to selectors that don't have it"""
    selector = selector.strip()

    # Skip if already scoped
    if selector.startswith('.incident-injector-panel'):
        return selector

    # Skip @ rules, keyframes, :root
    if selector.startswith('@') or selector.startswith(':root'):
        return selector

    # Handle multiple selectors separated by comma
    if ',' in selector:
        parts = [scope_css_selector(p.strip()) for p in selector.split(',')]
        return ', '.join(parts)

    # Add prefix to regular selectors
    return f'.incident-injector-panel {selector}'

def process_css_file(input_file, output_file):
    """Process CSS file and scope all selectors"""
    with open(input_file, 'r') as f:
        content = f.read()

    # Pattern to match CSS rules (selector { ... })
    # This is a simple approach - may not handle all edge cases
    pattern = r'([^{}]+)\s*\{([^{}]*)\}'

    def replace_selector(match):
        selector = match.group(1).strip()
        properties = match.group(2)

        # Scope the selector
        scoped = scope_css_selector(selector)

        return f'{scoped} {{{properties}}}'

    # Process the file
    result = re.sub(pattern, replace_selector, content, flags=re.MULTILINE)

    with open(output_file, 'w') as f:
        f.write(result)

    print(f'Scoped CSS written to {output_file}')

if __name__ == '__main__':
    process_css_file('extension/panel.css.backup', 'extension/panel.css')
