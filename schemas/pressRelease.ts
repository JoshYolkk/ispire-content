import { defineType, defineField } from 'sanity'

export const pressRelease = defineType({
  name: 'pressRelease',
  title: 'Press Release',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 200,
      },
      validation: (Rule) => Rule.required(),
    }),
    
    defineField({
      name: 'shortDescription',
      title: 'Short Description',
      type: 'text',
      rows: 3,
      description: 'AI-generated 2-3 sentence summary for preview cards and SEO.',
    }),
    
    defineField({
      name: 'bodyText',
      title: 'Body Text',
      type: 'text',
      rows: 25,
      description: 'Full article content from press release.',
    }),
    
    defineField({
      name: 'date',
      title: 'Date',
      type: 'datetime',
    }),
    
    defineField({
      name: 'sourceUrl',
      title: 'Source URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    
    defineField({
      name: 'sourceGuid',
      title: 'Source GUID',
      type: 'string',
      validation: (Rule) => Rule.required(),
      description: 'Unique RSS GUID or source URL used to prevent duplicate imports.',
    }),
    
    defineField({
      name: 'sourceId',
      title: 'Source ID / PR Newswire ID',
      type: 'string',
      description: 'Usually the numeric PR Newswire ID extracted from the article URL.',
    }),
    
    defineField({
      name: 'sourceName',
      title: 'Source Name',
      type: 'string',
      initialValue: 'PR Newswire',
    }),
    
    defineField({
      name: 'newsProvidedBy',
      title: 'Company / News Provided By',
      type: 'string',
      initialValue: 'Ispire Technology Inc.',
    }),
    
    defineField({
      name: 'importedAt',
      title: 'Imported At',
      type: 'datetime',
      description: 'Timestamp when this press release was imported into Sanity.',
    }),
    
    defineField({
      name: 'syncStatus',
      title: 'Sync Status',
      type: 'string',
      options: {
        list: [
          { title: 'Imported', value: 'imported' },
          { title: 'Published', value: 'published' },
          { title: 'Failed', value: 'failed' },
          { title: 'Skipped', value: 'skipped' },
          { title: 'Manual', value: 'manual' },
        ],
      },
      initialValue: 'imported',
    }),
    
    defineField({
      name: 'webflowItemId',
      title: 'Webflow Item ID',
      type: 'string',
      description: 'Stored after the item has been created in Webflow.',
    }),
    
    defineField({
      name: 'webflowSyncedAt',
      title: 'Webflow Synced At',
      type: 'datetime',
    }),
    
    defineField({
      name: 'syncError',
      title: 'Sync Error',
      type: 'text',
      rows: 3,
      description: 'Stores the latest sync error if Webflow publishing fails.',
    }),
  ],
  
  preview: {
    select: {
      title: 'title',
      date: 'date',
      status: 'syncStatus',
    },
    prepare({ title, date, status }) {
      return {
        title,
        subtitle: date ? `${new Date(date).toLocaleDateString()} · ${status || 'imported'}` : status || 'imported',
      }
    },
  },
})