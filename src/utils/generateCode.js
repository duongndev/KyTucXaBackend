export const generateRegistrationCode = () => {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `REG-${year}${month}${day}-${random}`;
};