import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactDocument = HydratedDocument<ContactRecord>;

@Schema({ timestamps: true, collection: 'contacts' })
export class ContactRecord {
  @Prop({ type: String, required: true, index: true })
  ownerId: string;

  @Prop({ type: String, required: true, index: true })
  contactUserId: string;

  createdAt: Date;

  updatedAt: Date;
}

export const ContactSchema = SchemaFactory.createForClass(ContactRecord);
ContactSchema.index({ ownerId: 1, contactUserId: 1 }, { unique: true });
