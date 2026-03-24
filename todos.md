1. implement a regex for URLs to scan from sitemap (eg 'orkin.com/locations/*')

Issues to detect:

# Invalid value for attribute autocomplete .
The autocomplete attribute describes allowed values for input fields which lets the
browser provide auto fill suggestions (e.g. your first name). This helps people who have
difficulty typing and also lets assistive technologies add icons to indicate input type for
people with cognitive issues.
WCAG 2.1 1.3.5
'new-text' is not an autocomplete token.
<input autocomplete='new-text' data-testid='input-field' name='zipCode' value='' data-
id='find-branch-zip-code' placeholder='' id='zipCode' class='chakra-input ...'> line 539
https://www.orkin.com/
Page 33 of 158 Report produced by SortSite 6.57.2026.0
https://www.orkin.com/free-pest-control-estimate September 15, 2025
'new-text' is not an autocomplete token.
<input autocomplete='new-text' data-testid='input-field' name='zipCode' value='' data-
id='find-branch-zip-code' placeholder='' id='zipCode' class='chakra-input ...'> line 756
https://www.orkin.com/home-services
'new-text' is not an autocomplete token.
<input autocomplete='new-text' data-testid='input-field' name='zipCode' value='' data-
id='find-branch-zip-code' placeholder='' id='zipCode' class='chakra-input ...'> line 568
https://www.orkin.com/home-services/gutter-cover-protection

# Cannot use aria-label or aria-labelledby on elements and roles that prohibit naming.

The div and span elements have an implicit role of generic and cannot be named unless
they have a role attribute. The following roles cannot be named: caption code deletion
emphasis generic insertion paragraph presentation strong subscript superscript
HTML5 ARIA 1.2
Element role: generic
<div tabindex='0' class='css-16mcfel' aria-label='National Leader on Your Team'>...</div>

# Ensure that text and background colors have enough contrast.

Some users find it hard to read light gray text on a white background, dark gray text on
a black background and white text on a red background.
• The contrast ratio should be 3.0 or more for 18 point text, or larger
• The contrast ratio should be 3.0 or more for 14 point bold text, or larger
• The contrast ratio should be 4.5 or more for all other text
WCAG 2.1 AA 1.4.3 Section 508 (2017) AA 1.4.3
The text color to background color contrast ratio after composition is:

3.44 with color: rgb(239,239,240) background: rgb(128,128,128) font-size: 13.50pt
font-weight: 400
<p class='chakra-text ...' itemprop='name'>Find My Branch</p> line 171
https://www.orkin.com/
The text color to background color contrast ratio after composition is:
3.44 with color: rgb(239,239,240) background: rgb(128,128,128) font-size: 13.50pt
font-weight: 400
<p class='chakra-text ...' itemprop='name'>Find My Branch</p> line 171
https://www.orkin.com/about/community-involvement
