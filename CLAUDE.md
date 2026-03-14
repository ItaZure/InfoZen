# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Learning Tool - A self-learning application powered by large language models. Deployed locally on port 10101.

**Tech Stack:**
- Frontend: React + Vite
- Styling: Tailwind CSS with custom Serif design system
- Future: Node.js/Express backend + MongoDB (not yet implemented)

## Design System

This project follows a **Serif Editorial Design System** inspired by luxury publications and literary magazines. See [style.md](style.md) for complete design guidelines.

**Key Design Principles:**
- Typography-first approach with Playfair Display serif for headings
- Warm color palette: Ivory backgrounds (#FAFAF8) with Burnished Gold accents (#B8860B)
- Generous whitespace and relaxed line heights (1.75)
- Thin rule lines (1px) for visual structure
- Small caps with wide tracking for labels and meta information
- Minimum touch targets: 44x44px for accessibility

**Color Palette:**
```css
--background: #FAFAF8 (warm ivory)
--foreground: #1A1A1A (rich black)
--accent: #B8860B (burnished gold)
--border: #E8E4DF (warm gray)
--muted-foreground: #6B6B6B (secondary text)
```

**Typography:**
- Display/Headlines: `Playfair Display` (serif)
- Body/UI: `Source Sans 3` (sans-serif)
- Labels/Small Caps: `IBM Plex Mono` (monospace)

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── layout/         # Layout components (Header, Nav, etc.)
│   ├── chat/           # Chat-related components
│   ├── notes/          # Notes components
│   └── common/         # Common UI elements (Button, Input, Card)
├── pages/              # Page components
│   ├── Chat.jsx        # 对谈 page
│   ├── Wisdom.jsx      # 拾慧 page
│   └── Notes.jsx       # 笔记 page
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── App.jsx             # Main app component with routing
└── main.jsx            # Entry point
```

## Key Features

### 1. Chat (对谈)
**Layout:** Split view with left sidebar and right panel
- **Left:** Topic selection, chat history, input box (supports image paste with Cmd+V)
- **Right Top:** Conversation tree showing dialogue structure
- **Right Bottom:** Notes panel

**Chat Styling:**
- User messages: Right-aligned, yellow background (#B8860B), white text
- AI messages: Left-aligned, white background, black text

**Conversation Tree:**
- Each node represents a user question (first 20 characters)
- Clicking a node jumps to that message and highlights AI response with yellow border
- New questions become child nodes of selected node
- AI context only includes parent node history

### 2. Wisdom (拾慧)
- URL input for article extraction
- Summary display
- Article translation

### 3. Notes (笔记)
- Notes list with clickable titles
- Note detail view with edit/delete functionality
- Supports text and images

## Development Commands

**Install dependencies:**
```bash
npm install
```

**Start development server:**
```bash
npm run dev
# Server runs on http://localhost:5173
```

**Build for production:**
```bash
npm run build
```

**Preview production build:**
```bash
npm run preview
```

## Current Development Phase

**Phase 1: Frontend Foundation (Current)**
- Focus on Chat page implementation first
- AI responses use mock data (incremental numbers: 1, 2, 3...)
- No backend integration yet

**Mock AI Response Pattern:**
```javascript
let counter = 0;
const mockAIResponse = () => {
  counter++;
  return counter.toString();
};
```

## Styling Guidelines

**Component Structure:**
Always follow the design system in [style.md](style.md):

1. Use Tailwind utility classes for styling
2. Maintain editorial aesthetic with generous spacing
3. Apply serif font to all headings
4. Use small caps pattern for labels
5. Include thin rule lines for section divisions

**Example Component Pattern:**
```jsx
<section className="py-32 px-8">
  <div className="section-label">
    <span className="rule-line flex-1" />
    <span className="section-label-text">Section Name</span>
    <span className="rule-line flex-1" />
  </div>
  <h2 className="font-serif text-4xl mb-6">Heading</h2>
  <p className="text-lg leading-relaxed">Content...</p>
</section>
```

## Important Notes

- Start Chat page development before other features
- Use mock data for AI responses during Phase 1
- Follow accessibility guidelines (WCAG AA minimum)
- Maintain responsive design for mobile/tablet
- All interactive elements must meet 44x44px minimum touch target
- Preserve design system consistency across all components
