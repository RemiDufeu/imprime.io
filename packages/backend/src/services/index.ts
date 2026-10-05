import { ImageService } from './ImageService.js'
import { FontService } from './FontService.js'
import { VariableService } from './VariableService.js'
import { PageService } from './PageService.js'
import { TemplateService } from './TemplateService.js'
import { ExportService } from './ExportService.js'
import { MailerService } from './MailerService.js'
import { AuthService } from './AuthService.js'
import { SettingsService } from './SettingsService.js'

// Instantiate services with dependency injection
const imageService = new ImageService()
const fontService = new FontService()
const variableService = new VariableService()
const pageService = new PageService(imageService)
const templateService = new TemplateService(imageService)
const exportService = new ExportService(imageService, fontService)
const mailerService = new MailerService()
const authService = new AuthService(mailerService)
const settingsService = new SettingsService(mailerService, authService)

export {
  imageService,
  fontService,
  variableService,
  pageService,
  templateService,
  exportService,
  mailerService,
  authService,
  settingsService,
}
export { AppError, NotFoundError, ForbiddenError, ValidationError, ConflictError } from './errors.js'
