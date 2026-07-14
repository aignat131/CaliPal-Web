'use client'

import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Check, X } from 'lucide-react'
import { getCroppedImage, getCroppedTrainingImage } from '@/lib/utils/imageUtils'
import { useT } from '@/lib/context/LanguageContext'

interface Props {
  imageSrc: string
  onConfirm: (file: File) => void
  onCancel: () => void
  mode?: 'profile' | 'training'
  zIndex?: number
}

export default function ImageCropModal({ imageSrc, onConfirm, onCancel, mode = 'profile', zIndex = 100 }: Props) {
  const t = useT()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const isTraining = mode === 'training'

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleConfirm() {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const file = isTraining
        ? await getCroppedTrainingImage(imageSrc, croppedAreaPixels)
        : await getCroppedImage(imageSrc, croppedAreaPixels, 400)
      onConfirm(file)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: '#000', zIndex }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0">
        <button
          onClick={onCancel}
          aria-label="Cancel crop"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10"
        >
          <X size={18} className="text-white" />
        </button>
        <p className="text-sm font-bold text-white">{t('crop.title')}</p>
        <button
          onClick={handleConfirm}
          disabled={processing}
          aria-label="Confirm crop"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-green disabled:opacity-50"
        >
          {processing
            ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            : <Check size={18} className="text-black" strokeWidth={3} />}
        </button>
      </div>

      {/* Cropper area */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={isTraining ? 4 / 3 : 1}
          cropShape={isTraining ? 'rect' : 'round'}
          showGrid={isTraining}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { backgroundColor: '#000' },
            cropAreaStyle: { border: '2px solid #1ED75F', boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' },
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="px-8 pb-12 pt-5 flex-shrink-0">
        <p className="text-[10px] font-bold text-white/35 tracking-widest text-center mb-3">ZOOM</p>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="w-full accent-brand-green"
          style={{ accentColor: '#1ED75F' }}
        />
      </div>
    </div>
  )
}
