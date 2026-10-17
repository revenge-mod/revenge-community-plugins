import { recordCredentialValidation } from '../lib/debug'
import { getSettings } from '../lib/state'
import { LastFmService } from './LastFmService'
import { LibreFmService } from './LibreFmService'
import { ListenBrainzService } from './ListenBrainzService'
import { MediaSessionService } from './MediaSessionService'
import type { ServiceClient, ServiceType } from '../types'

export class ServiceFactory {
	private static instance: ServiceFactory
	private serviceInstances: Map<ServiceType, ServiceClient>

	private constructor() {
		// singleton pattern
		this.serviceInstances = new Map()
	}

	public static getInstance(): ServiceFactory {
		if (!ServiceFactory.instance) {
			ServiceFactory.instance = new ServiceFactory()
		}
		return ServiceFactory.instance
	}

	public getService(serviceType?: ServiceType): ServiceClient {
		// make sure map is set up
		if (!this.serviceInstances) {
			this.serviceInstances = new Map()
		}

		const type = serviceType || getSettings().service

		if (!type) {
			throw new Error(
				'[ServiceFactory] No service type specified and no default service configured',
			)
		}

		if (!this.serviceInstances.has(type)) {
			this.serviceInstances.set(type, this.createService(type))
		}

		return this.serviceInstances.get(type)!
	}

	public getCurrentService(): ServiceClient {
		return this.getService(getSettings().service)
	}

	private createService(serviceType: ServiceType): ServiceClient {
		switch (serviceType) {
			case 'lastfm':
				return new LastFmService()
			case 'librefm':
				return new LibreFmService()
			case 'listenbrainz':
				return new ListenBrainzService()
			case 'mediasession':
				return new MediaSessionService()
			default:
				throw new Error(`[ServiceFactory] Unknown service type: ${serviceType}`)
		}
	}

	public clearCache(): void {
		if (this.serviceInstances) {
			this.serviceInstances.clear()
		} else {
			this.serviceInstances = new Map()
		}
	}

	public validateCurrentService(): Promise<boolean> {
		const result = this.getCurrentService().validateCredentials()
		result.then(isValid => {
			const service = getSettings().service
			if (service) recordCredentialValidation(service, isValid)
		})
		return result
	}

	public async testService(serviceType: ServiceType): Promise<boolean> {
		try {
			const service = this.getService(serviceType)
			const result = await service.validateCredentials()
			recordCredentialValidation(serviceType, result)
			return result
		} catch (_error) {
			recordCredentialValidation(serviceType, false)
			return false
		}
	}

	public getSupportedServices(): ServiceType[] {
		return ['lastfm', 'librefm', 'listenbrainz', 'mediasession']
	}

	public getServiceDisplayName(serviceType: ServiceType): string {
		const service = this.getService(serviceType)
		return service.getServiceName()
	}
}

// main instance
export const serviceFactory = ServiceFactory.getInstance()

// shortcut functions
export const getCurrentService = () => serviceFactory.getCurrentService()
export const getService = (type?: ServiceType) =>
	serviceFactory.getService(type)
export const validateCurrentService = () =>
	serviceFactory.validateCurrentService()
