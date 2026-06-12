export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('[PushNotifications] Notifications API not available')
    return 'denied'
  }

  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  const result = await Notification.requestPermission()
  return result
}

export async function sendNotification(
  title: string,
  body: string,
  options?: {
    icon?: string
    tag?: string
    data?: Record<string, unknown>
    requireInteraction?: boolean
    silent?: boolean
    onClick?: () => void
  }
): Promise<boolean> {
  if (!('Notification' in window)) return false

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return false

  try {
    const notif = new Notification(title, {
      body,
      icon: options?.icon || '/icon-192.png',
      tag: options?.tag || 'morpheus',
      data: options?.data,
      requireInteraction: options?.requireInteraction || false,
      silent: options?.silent || false,
    })

    if (options?.onClick) {
      notif.onclick = () => {
        options.onClick!()
        notif.close()
      }
    }

    return true
  } catch (err) {
    console.error('[PushNotifications] Failed to send:', err)
    return false
  }
}

export async function sendDeployNotification(status: 'success' | 'failed' | 'building', projectName: string): Promise<void> {
  const titles: Record<string, string> = {
    success: 'Deploy concluido',
    failed: 'Deploy falhou',
    building: 'Deploy em andamento',
  }
  const bodies: Record<string, string> = {
    success: `${projectName} foi implantado com sucesso.`,
    failed: `${projectName} falhou no deploy. Verifique os logs.`,
    building: `${projectName} esta sendo implantado...`,
  }
  await sendNotification(titles[status], bodies[status], {
    tag: `deploy-${projectName}`,
    requireInteraction: status === 'failed',
  })
}

export async function sendSecurityAlert(deviceLabel: string, location: string): Promise<void> {
  await sendNotification(
    'Alerta de Seguranca',
    `Novo dispositivo detectado: ${deviceLabel} (${location})`,
    {
      tag: 'security-alert',
      requireInteraction: true,
    }
  )
}
