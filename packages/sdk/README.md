# @imprime/sdk

TypeScript SDK for Imprime API - Create and manage presentations programmatically.

## Installation

```bash
npm install @imprime/sdk
```

## Quick Start

```typescript
import { ImprimeClient } from '@imprime/sdk'

// Initialize the client
const client = new ImprimeClient({
  baseUrl: 'http://localhost:3001/api'
})

// Create a presentation
const presentation = await client.createPresentation('My Presentation')

// Add a slide
const updated = await client.addSlide(presentation._id)
const slideId = updated.slides[0]._id

// Add shapes
await client.addRectangle(presentation._id, slideId, {
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#3b82f6'
})

await client.addText(presentation._id, slideId, {
  x: 120,
  y: 120,
  text: 'Hello World!',
  fontSize: 24,
  color: '#ffffff'
})
```

## API Reference

### Constructor

```typescript
new ImprimeClient(options?: ImprimeClientOptions)
```

**Options:**
- `baseUrl?: string` - Base URL of the Imprime API (default: `http://localhost:3001/api`)
- `timeout?: number` - Request timeout in milliseconds (default: `30000`)

### Presentation Methods

#### `listPresentations()`
List all presentations.

```typescript
const presentations = await client.listPresentations()
```

#### `getPresentation(id: string)`
Get a specific presentation by ID.

```typescript
const presentation = await client.getPresentation('674abc123def456')
```

#### `createPresentation(title?: string)`
Create a new presentation.

```typescript
const presentation = await client.createPresentation('Q4 Results')
```

#### `updatePresentation(id: string, data: { title?: string; slides?: Slide[] })`
Update a presentation's title or slides.

```typescript
await client.updatePresentation('674abc123def456', {
  title: 'Updated Title'
})
```

#### `deletePresentation(id: string)`
Delete a presentation.

```typescript
await client.deletePresentation('674abc123def456')
```

### Slide Methods

#### `addSlide(presentationId: string)`
Add a new blank slide to a presentation.

```typescript
const updated = await client.addSlide('674abc123def456')
```

#### `updateSlide(presentationId: string, slideId: string, shapes: Shape[])`
Update all shapes on a slide.

```typescript
await client.updateSlide('674abc123def456', 'slide-123', [
  { id: 'rect-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: '#000' }
])
```

#### `deleteSlide(presentationId: string, slideId: string)`
Delete a slide from a presentation.

```typescript
await client.deleteSlide('674abc123def456', 'slide-123')
```

### Shape Methods

#### `addRectangle(presentationId, slideId, options)`
Add a rectangle to a slide.

```typescript
await client.addRectangle('674abc123def456', 'slide-123', {
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#3b82f6' // optional, default: '#3b82f6'
})
```

#### `addEllipse(presentationId, slideId, options)`
Add an ellipse/circle to a slide.

```typescript
await client.addEllipse('674abc123def456', 'slide-123', {
  x: 100,
  y: 100,
  width: 150,
  height: 150,
  fill: '#f59e0b' // optional, default: '#f59e0b'
})
```

#### `addText(presentationId, slideId, options)`
Add a text box to a slide.

```typescript
await client.addText('674abc123def456', 'slide-123', {
  x: 50,
  y: 50,
  text: 'Hello World',
  width: 200,         // optional, default: 200
  height: 50,         // optional, default: 50
  fontSize: 24,       // optional, default: 16
  fontFamily: 'Arial', // optional, default: 'Arial, sans-serif'
  color: '#000000'    // optional, default: '#000000'
})
```

#### `updateShape(presentationId, slideId, shapeId, updates)`
Update a shape's properties.

```typescript
await client.updateShape('674abc123def456', 'slide-123', 'rect-1', {
  x: 150,
  y: 150,
  fill: '#ff0000'
})
```

#### `deleteShape(presentationId, slideId, shapeId)`
Delete a shape from a slide.

```typescript
await client.deleteShape('674abc123def456', 'slide-123', 'rect-1')
```

## Error Handling

The SDK throws errors for failed requests:

```typescript
try {
  await client.getPresentation('invalid-id')
} catch (error) {
  console.error('Failed to get presentation:', error.message)
}
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type { Presentation, Slide, Shape } from '@imprime/sdk'

const presentation: Presentation = await client.getPresentation(id)
const slide: Slide = presentation.slides[0]
const shape: Shape = slide.shapes[0]
```

## Use Cases

- **Automation**: Generate presentations from data
- **CLI tools**: Build command-line tools for slide management
- **Testing**: Automated testing of presentation features
- **MCP Servers**: Build AI-accessible presentation tools
- **Integrations**: Connect Imprime to other services

## Requirements

- Node.js 18+
- Imprime backend server running
