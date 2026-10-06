import { Global, Module } from '@nestjs/common';
import { IMAGE_STORAGE } from './image-storage';
import { LocalDiskImageStorage } from './local-disk-image-storage';

@Global()
@Module({
  providers: [
    LocalDiskImageStorage,
    { provide: IMAGE_STORAGE, useExisting: LocalDiskImageStorage },
  ],
  exports: [IMAGE_STORAGE, LocalDiskImageStorage],
})
export class StorageModule {}
