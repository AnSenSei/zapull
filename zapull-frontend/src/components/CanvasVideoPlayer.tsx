'use client'

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'

interface CanvasVideoPlayerProps {
  src: string
  width?: number
  height?: number
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  onEnded?: () => void
  onLoadedData?: () => void
  className?: string
  style?: React.CSSProperties
}

export interface CanvasVideoPlayerRef {
  play: () => Promise<void>
  pause: () => void
  currentTime: number
  duration: number
  paused: boolean
}

const CanvasVideoPlayer = forwardRef<CanvasVideoPlayerRef, CanvasVideoPlayerProps>((
  {
    src,
    width = 800,
    height = 600,
    autoPlay = false,
    loop = false,
    muted = true,
    onEnded,
    onLoadedData,
    className = '',
    style = {}
  },
  ref
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const animationFrameRef = useRef<number>()
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    play: async () => {
      if (videoRef.current) {
        try {
          await videoRef.current.play()
        } catch (err) {
          console.error('Failed to play video:', err)
          throw err
        }
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause()
      }
    },
    get currentTime() {
      return videoRef.current?.currentTime || 0
    },
    get duration() {
      return videoRef.current?.duration || 0
    },
    get paused() {
      return videoRef.current?.paused ?? true
    }
  }))

  // 渲染视频帧到Canvas
  const renderFrame = () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    
    if (!canvas || !video || video.paused || video.ended) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 获取设备像素比
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // 清除画布（使用实际分辨率）并填充黑色背景（用于letterbox/pillarbox）
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 以"contain"方式绘制，保持视频本身宽高比
    try {
      const vw = video.videoWidth || width
      const vh = video.videoHeight || height
      if (vw > 0 && vh > 0) {
        // 目标显示尺寸（props传入的width/height，对应CSS像素；上下文已按dpr缩放）
        const targetW = width
        const targetH = height
        const scale = Math.min(targetW / vw, targetH / vh)
        const drawW = vw * scale
        const drawH = vh * scale
        const dx = (targetW - drawW) / 2
        const dy = (targetH - drawH) / 2
        // 使用9参数版本，源尺寸为视频本身像素
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, drawW, drawH)
      } else {
        // 回退：直接拉伸（极少数情况下videoWidth未就绪）
        ctx.drawImage(video, 0, 0, width, height)
      }
    } catch (err) {
      console.error('Failed to draw video frame:', err)
    }

    // 请求下一帧
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }

  // 处理视频加载完成
  const handleLoadedData = () => {
    // 清除加载超时
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    
    setIsLoaded(true)
    setError(null)
    if (onLoadedData) {
      onLoadedData()
    }
    // 开始渲染循环
    renderFrame()
  }

  // 处理视频播放
  const handlePlay = () => {
    renderFrame()
  }

  // 处理视频暂停
  const handlePause = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }

  // 处理视频结束
  const handleEnded = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (onEnded) {
      onEnded()
    }
  }

  // 处理视频加载错误
  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    // 清除加载超时
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    
    const video = e.target as HTMLVideoElement
    const error = video.error
    let errorMessage = 'Unknown video error'
    
    if (error) {
      // Provide more specific error messages
      switch(error.code) {
        case 1:
          errorMessage = 'Video loading aborted'
          break
        case 2:
          errorMessage = 'Network error while loading video'
          break
        case 3:
          errorMessage = 'Video decoding error'
          break
        case 4:
          errorMessage = 'Video format not supported'
          break
        default:
          errorMessage = `Video error: ${error.message}`
      }
    }
    
    setError(errorMessage)
    console.error('Video loading error:', errorMessage, error)
    
    // Log additional debugging info for mobile
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMobile) {
        console.error('Mobile device detected. User Agent:', navigator.userAgent)
        console.error('Video src:', src)
        console.error('Video readyState:', video.readyState)
        console.error('Video networkState:', video.networkState)
      }
    }
  }

  // Detect mobile device
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // More comprehensive mobile detection
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const checkMobile = 
        /android/i.test(userAgent) ||
        /webOS/i.test(userAgent) ||
        /iPhone/i.test(userAgent) ||
        /iPad/i.test(userAgent) ||
        /iPod/i.test(userAgent) ||
        /BlackBerry/i.test(userAgent) ||
        /Windows Phone/i.test(userAgent) ||
        // Additional check for Android devices
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || // iPad Pro
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0)
      
      setIsMobile(checkMobile)
      if (checkMobile) {
        console.log('Mobile device detected:', {
          userAgent,
          platform: navigator.platform,
          touchPoints: navigator.maxTouchPoints,
          vendor: navigator.vendor
        })
      }
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    
    if (!video || !canvas) return

    // 获取设备像素比，确保在高DPI屏幕上显示清晰
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // 设置Canvas的实际分辨率（考虑设备像素比）
    canvas.width = width * devicePixelRatio
    canvas.height = height * devicePixelRatio
    
    // 设置Canvas的显示尺寸
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    
    // 缩放绘图上下文以匹配设备像素比
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    // 添加事件监听器
    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)

    // Set video loading timeout (10 seconds)
    loadTimeoutRef.current = setTimeout(() => {
      if (!isLoaded) {
        setError('Video loading timeout, please check network connection or refresh page to retry')
        console.error('Video loading timeout')
      }
    }, 10000)

    // 如果设置了自动播放，尝试播放
    if (autoPlay) {
      // For mobile devices, we need to wait for user interaction or loadeddata event
      const attemptAutoPlay = async () => {
        try {
          // For Android devices, sometimes we need to set the video to play programmatically
          if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
            // Android-specific handling
            video.setAttribute('autoplay', 'true')
            video.setAttribute('muted', 'true')
          }
          
          await video.play()
        } catch (err: any) {
          console.error('Auto-play failed:', err)
          
          // Try to play muted if autoplay fails (common on mobile)
          if (err.name === 'NotAllowedError') {
            video.muted = true
            try {
              await video.play()
              console.log('Video started muted after autoplay restriction')
            } catch (secondErr) {
              console.error('Even muted autoplay failed:', secondErr)
              // On mobile, autoplay might fail due to browser policies
              // The video will play when user interacts with the page
            }
          }
        }
      }
      
      if (video.readyState >= 2) {
        attemptAutoPlay()
      } else {
        // Wait for the video to be ready
        const handleCanPlay = () => attemptAutoPlay()
        video.addEventListener('canplay', handleCanPlay, { once: true })
        
        // For Android, also try on loadedmetadata
        video.addEventListener('loadedmetadata', handleCanPlay, { once: true })
      }
    }

    return () => {
      // 清理事件监听器
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      
      // 清除加载超时
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
        loadTimeoutRef.current = null
      }
      
      // 取消动画帧
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [src, width, height, autoPlay])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
        loadTimeoutRef.current = null
      }
    }
  }, [])

  if (error) {
    // On mobile, try to show the video directly as a fallback
    if (isMobile) {
      return (
        <div className={`relative ${className}`} style={style}>
          <video
            src={src}
            width={width}
            height={height}
            autoPlay={autoPlay}
            muted={true}
            loop={loop}
            playsInline={true}
            webkitPlaysinline="true"
            x5-playsinline="true"
            webkit-playsinline="true"
            x-webkit-airplay="allow"
            x5-video-player-type="h5"
            x5-video-player-fullscreen="false"
            x5-video-orientation="portrait"
            crossOrigin="anonymous"
            controls={false}
            className="max-w-full"
            onError={() => {
              console.error('Fallback video also failed to load')
            }}
            onLoadedData={() => {
              console.log('Fallback video loaded successfully')
            }}
          />
          <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            Using fallback video player
          </div>
        </div>
      )
    }
    
    return (
      <div 
        className={`flex items-center justify-center bg-gray-800 text-red-400 ${className}`}
        style={{ width, height, ...style }}
      >
        <div className="text-center">
          <div className="text-sm mb-2">Failed to load video</div>
          <div className="text-xs opacity-70">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} style={style}>
      {/* 隐藏的视频元素，用于加载和控制播放 */}
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        loop={loop}
        preload="auto"
        style={{ display: 'none' }}
        playsInline={true}
        webkitPlaysinline="true"
        x5-playsinline="true"
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        x5-video-player-type="h5"
        x5-video-player-fullscreen="false"
        x5-video-orientation="portrait"
        crossOrigin="anonymous"
        controls={false}
        autoPlay={autoPlay}
        onLoadedData={handleLoadedData}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
      />
      
      {/* Canvas用于显示视频内容 */}
      <canvas
        ref={canvasRef}
        className="max-w-full"
        style={{
          display: isLoaded ? 'block' : 'none',
          imageRendering: 'auto'
        }}
      />
      
      {/* 加载状态 */}
      {!isLoaded && !error && (
        <div 
          className="flex items-center justify-center bg-gray-800 text-white"
          style={{ width, height }}
        >
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
            <div className="text-sm">Loading video...</div>
          </div>
        </div>
      )}
    </div>
  )
})

CanvasVideoPlayer.displayName = 'CanvasVideoPlayer'

export default CanvasVideoPlayer