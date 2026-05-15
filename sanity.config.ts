import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

export default defineConfig({
  name: 'ispire-content',
  title: 'Ispire Content',
  
  // Project ID and dataset are loaded from environment
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',

  plugins: [
    structureTool(),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})