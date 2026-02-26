'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import AdSlot from '@/components/AdSlot'

interface PublishStatus {
  success: boolean
  message: string
  timestamp?: string
  publicUrl?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [slot1File, setSlot1File] = useState<File | null>(null)
  const [slot2File, setSlot2File] = useState<File | null>(null)
  const [slot3File, setSlot3File] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(null)

  const STORAGE_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'saxvik-hub'
  const INSTALL_ID = process.env.NEXT_PUBLIC_INSTALL_ID || 'amfi-steinkjer'
  const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}`

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handlePublish = async () => {
    if (!slot1File && !slot2File && !slot3File) {
      setPublishStatus({
        success: false,
        message: 'Please select at least one ad file',
      })
      return
    }

    setIsUploading(true)
    setPublishStatus(null)

    try {
      // Upload files
      const uploadPromises = []

      if (slot1File) {
        uploadPromises.push(
          uploadAdFile(slot1File, 'slot1')
        )
      }

      if (slot2File) {
        uploadPromises.push(
          uploadAdFile(slot2File, 'slot2')
        )
      }

      if (slot3File) {
        uploadPromises.push(
          uploadAdFile(slot3File, 'slot3')
        )
      }

      await Promise.all(uploadPromises)

      // Create and upload playlist
      const playlist = {
        slots: ['slot1', 'slot2', 'slot3'],
        tryExt: ['.webm', '.mp4', '.jpg', '.jpeg', '.png', '.webp'],
        durationMs: 8000,
      }

      const { error: playlistError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(
          `installs/${INSTALL_ID}/ads/playlist.json`,
          JSON.stringify(playlist),
          { upsert: true, contentType: 'application/json' }
        )

      if (playlistError) {
        throw playlistError
      }

      const playlistUrl = `${STORAGE_BASE_URL}/installs/${INSTALL_ID}/ads/playlist.json?t=${Date.now()}`

      setPublishStatus({
        success: true,
        message: 'Published successfully!',
        timestamp: new Date().toLocaleString(),
        publicUrl: playlistUrl,
      })
    } catch (error: any) {
      setPublishStatus({
        success: false,
        message: `Error: ${error.message}`,
      })
    } finally {
      setIsUploading(false)
    }
  }

  const uploadAdFile = async (file: File, slotName: string) => {
    const ext = file.name.split('.').pop()
    const path = `installs/${INSTALL_ID}/ads/${slotName}.${ext}`

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true })

    if (error) {
      throw error
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Saxvik Hub
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Signage Control
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {user.email}
                </p>
                <p className="text-xs text-slate-500">Logged in</p>
              </div>
              <button
                onClick={signOut}
                className="btn btn-secondary text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Section title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Reklame / Ads</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload ad files for each display slot
          </p>
        </div>

        {/* Slots grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <AdSlot
            slotNumber={1}
            file={slot1File}
            onFileChange={setSlot1File}
            isUploading={isUploading}
          />
          <AdSlot
            slotNumber={2}
            file={slot2File}
            onFileChange={setSlot2File}
            isUploading={isUploading}
          />
          <AdSlot
            slotNumber={3}
            file={slot3File}
            onFileChange={setSlot3File}
            isUploading={isUploading}
          />
        </div>

        {/* Publish section */}
        <div className="space-y-4">
          <button
            onClick={handlePublish}
            disabled={isUploading}
            className="btn btn-primary w-full py-3 text-lg font-semibold"
          >
            {isUploading ? 'Publishing...' : 'Publish'}
          </button>

          {publishStatus && (
            <div
              className={`card border-l-4 ${
                publishStatus.success
                  ? 'border-l-green-500 bg-green-50'
                  : 'border-l-red-500 bg-red-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p
                    className={`font-semibold ${
                      publishStatus.success
                        ? 'text-green-900'
                        : 'text-red-900'
                    }`}
                  >
                    {publishStatus.success ? '✅' : '❌'}{' '}
                    {publishStatus.message}
                  </p>
                  {publishStatus.timestamp && (
                    <p className="mt-1 text-sm text-slate-600">
                      {publishStatus.timestamp}
                    </p>
                  )}
                  {publishStatus.publicUrl && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-slate-700">
                        Playlist URL:
                      </p>
                      <div className="rounded bg-white p-2 break-all text-xs text-slate-700 font-mono">
                        {publishStatus.publicUrl}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            publishStatus.publicUrl || ''
                          )
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Copy URL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="mt-12 rounded-lg bg-blue-50 p-6 border border-blue-200">
          <h3 className="font-semibold text-blue-900">Storage Information</h3>
          <div className="mt-4 space-y-2 text-sm text-blue-800">
            <p>
              <strong>Install ID:</strong> {INSTALL_ID}
            </p>
            <p>
              <strong>Storage Bucket:</strong> {STORAGE_BUCKET}
            </p>
            <p>
              <strong>Base URL:</strong>
            </p>
            <div className="ml-2 rounded bg-white p-2 break-all font-mono text-xs">
              {STORAGE_BASE_URL}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
