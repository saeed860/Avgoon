import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const phone = process.env.ADMIN_BOOTSTRAP_PHONE?.trim();
  const confirmation = process.env.ADMIN_BOOTSTRAP_CONFIRM;

  if (Boolean(email) === Boolean(phone)) {
    throw new Error('Set exactly one of ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PHONE.');
  }
  if (confirmation !== 'CREATE_FIRST_ADMIN') {
    throw new Error('Set ADMIN_BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN for this one-time operation.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const admins = await tx.user.count({ where: { role: 'ADMIN' } });
    if (admins > 0) {
      throw new Error('Bootstrap refused: an ADMIN account already exists. No account was changed.');
    }

    const user = email
      ? await tx.user.findUnique({ where: { email } })
      : await tx.user.findUnique({ where: { phone } });

    if (!user) {
      throw new Error('Target account does not exist. First register and verify this email/phone through the normal OTP flow.');
    }

    if (user.role !== 'CUSTOMER') {
      throw new Error('Target account is not a CUSTOMER. No account was changed.');
    }

    const updated = await tx.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.info('First administrator successfully configured:', result);
  console.info('Sign in again to receive a session with the current ADMIN role.');
}

main()
  .catch((error) => {
    console.error('Administrator bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
