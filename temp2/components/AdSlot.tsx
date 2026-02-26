'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

interface AdSlotProps {
  slotNumber: number
  file: File | null
  onFileChange: (file: File | null) => void
  isUploading: boolean
}

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'jpg', 'jpeg', 'png', 'webp']

export default function AdSlot({
  slotNumber,
  file,
  onFileChange,
  isUploading,
}: AdSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const validateFile = (f: File): boolean => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return false
    }
    if (f.size > 500 * 1024 * 1024) {
      setError('File too large (max 500MB)')
      return false
    }
    setError('')
    return true
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (isUploading) return

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      const f = droppedFiles[0]
      if (validateFile(f)) {
        onFileChange(f)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      const f = files[0]
      if (validateFile(f)) {
        onFileChange(f)
      }
    }
  }

  const isVideo = file?.type.startsWith('video/')
  const isImage = file?.type.startsWith('image/')

  return (
    <div className="card space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Slot {slotNumber}</h3>

      {/* Preview */}
      <div className="min-h-40 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
        {file && isVideo && (
          <video
            className="max-h-40 max-w-full"
            controls
            src={URL.createObjectURL(file)}
          />
        )}
        {file && isImage && (
          <img
            className="max-h-40 max-w-full object-contain"
            src={URL.createObjectURL(file)}
            alt={`Preview slot ${slotNumber}`}
          />
        )}
        {!file && (
          <div className="text-center text-slate-500">
            <p className="text-sm">No file selected</p>
          </div>
        )}
      </div>

      {/* File info */}
      {file && (
        <div className="text-sm text-slate-600">
          <p>
            <strong>File:</strong> {file.name}
          </p>
          <p>
            <strong>Size:</strong> {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {/* Error */}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!isUploading) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          disabled={isUploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-slate-700 hover:text-blue-600"
          disabled={isUploading}
        >
          {dragOver ? 'Drop file here' : 'Click to select or drag & drop'}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Allowed: {ALLOWED_EXTENSIONS.join(', ')}
        </p>
      </div>

      {/* Clear button */}
      {file && !isUploading && (
        <button
          type="button"
          onClick={() => onFileChange(null)}
          className="btn btn-secondary w-full text-sm"
        >
          Clear
        </button>
      )}
    </div>
  )
}
