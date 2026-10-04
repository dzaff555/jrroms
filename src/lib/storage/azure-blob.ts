import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'developer-task-submissions';

function getBlobService() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!accountName || !accountKey) {
    throw new Error(
      'Azure Blob Storage belum dikonfigurasi. Atur AZURE_STORAGE_ACCOUNT_NAME dan AZURE_STORAGE_ACCOUNT_KEY.'
    );
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  return {
    credential,
    service: new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    ),
  };
}

export async function getPrivateContainer() {
  const { service } = getBlobService();
  const container = service.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();
  const properties = await container.getProperties();
  if (properties.blobPublicAccess) {
    await container.setAccessPolicy(undefined);
  }
  return container;
}

export async function createUploadUrl(blobName: string) {
  const { credential } = getBlobService();
  const container = await getPrivateContainer();
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
    },
    credential
  ).toString();

  return {
    url: `${container.getBlockBlobClient(blobName).url}?${sas}`,
    container,
  };
}

export async function createDownloadUrl(
  blobName: string,
  fileName: string,
  contentType: string
) {
  const { credential } = getBlobService();
  const container = await getPrivateContainer();
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: new Date(Date.now() + 5 * 60 * 1000),
      protocol: SASProtocol.Https,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      contentType,
    },
    credential
  ).toString();

  return `${container.getBlockBlobClient(blobName).url}?${sas}`;
}
