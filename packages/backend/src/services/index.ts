import { ImageService } from './ImageService.js'
import { VariableService } from './VariableService.js'
import { SlideService } from './SlideService.js'
import { PresentationService } from './PresentationService.js'
import { ExportService } from './ExportService.js'
import { MailerService } from './MailerService.js'
import { AuthService } from './AuthService.js'

// Instantiate services with dependency injection
const imageService = new ImageService()
const variableService = new VariableService()
const slideService = new SlideService(imageService)
const presentationService = new PresentationService(imageService)
const exportService = new ExportService(imageService)
const mailerService = new MailerService()
const authService = new AuthService(mailerService)

export {
  imageService,
  variableService,
  slideService,
  presentationService,
  exportService,
  mailerService,
  authService,
}
export { AppError, NotFoundError, ValidationError, ConflictError } from './errors.js'
