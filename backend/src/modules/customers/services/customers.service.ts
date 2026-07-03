import type { Db } from '../../database/client';
import {
  deleteCustomer,
  findCustomerById,
  insertCustomer,
  listCustomers,
  updateCustomer,
} from '../repository/customers.repository';
import type { CustomerRow, UpdateCustomerFields } from '../types/customers.types';
import type { CreateCustomerInput, UpdateCustomerInput } from '../validators/customers.validator';

export const getCustomers = async (db: Db): Promise<CustomerRow[]> => {
  return listCustomers(db);
};

export const getCustomerById = async (db: Db, id: string): Promise<CustomerRow | null> => {
  return findCustomerById(db, id);
};

export const createCustomer = async (
  db: Db,
  input: CreateCustomerInput,
): Promise<CustomerRow> => {
  return insertCustomer(db, input);
};

export const editCustomer = async (
  db: Db,
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerRow | null> => {
  const fields: UpdateCustomerFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.identification !== undefined) fields.identification = input.identification;
  if (input.phone !== undefined) fields.phone = input.phone;
  if (input.email !== undefined) fields.email = input.email;
  if (input.observation !== undefined) fields.observation = input.observation;
  if (input.address !== undefined) fields.address = input.address;
  if (input.state !== undefined) fields.state = input.state;
  if (input.razonSocial !== undefined) fields.razonSocial = input.razonSocial;
  if (input.timezone !== undefined) fields.timezone = input.timezone;

  return updateCustomer(db, id, fields);
};

export const removeCustomer = async (db: Db, id: string): Promise<{ id: string } | null> => {
  return deleteCustomer(db, id);
};
