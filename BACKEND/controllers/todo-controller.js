//-------------------APIAuth-----------------------------
const APIKEYS = require('../apikeys');

//--------------------imports-------------------------
const mongoose = require('mongoose');
const client = require('twilio')(APIKEYS.TWILIOSID, APIKEYS.TWILIOAUTHTOKEN);
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(APIKEYS.SENDGRIDAPIKEY);

//------------------Modules--------------------------
const userController = require('../controllers/user-controller');
const getUserById = userController.getUserById;
const getUserByProps = userController.getUserByProps;
//------------------Models------------------------------
const HttpError = require('../models/http-error');
const ToDoItem = require('../models/toDoItem-model');

//-----------------------HelperFunctions-----------------------
const getItemById = async(tid) =>{
    let item
    try{
        item = await ToDoItem.findById(tid);
    }
    catch(error){
        return({error:error,errorMessage:'Could not access task in database',errorCode:500})
    };
    if(!item){
        return({error:true,errorMessage:'Task not in database',errorCode:404})
    }
    return(item);
}

const itemInDataBase = async(tid) =>{
    let item;
    try{
        item = await ToDoItem.exists({ _id: tid })
    }
    catch{
        return({error:{message:`Accessing database failed`, code:500}})
    }
    return(item);
}

const deleteItemHelper = async (req) => {
       //getting item
       const {uid,tid,oldCid}= req.body;
       let item = await getItemById(tid);
       if(!!item.error){return({error:item.error, errorMessage:item.errorMessage, errorCode:item.errorCode})}
       //console.log(item)
       //getting user
       let user = await getUserById(uid); 
       if(!!user.error){return({error:user.error, errorMessage:user.errorMessage, errorCode:user.errorCode})}
   
       let oldCategory
       if (oldCid===undefined)
       {
           //find category from searching
           
           oldCategory = user.toDoCategories.filter(category => 
              category.toDoList.filter(item => 
                   item._id.toString()===tid
               ).length!==0
           )[0]
       }
       else{ //alot more efficient than way above
           oldCategory = user.toDoCategories.filter(category => category.name === oldCid)
       }
       if (!oldCategory){ 
        return({error:true, errorMessage:"Task/Category Cant Be Located", errorCode:422})};
       
       if(item.creator._id.toString() === uid){
           console.log("removing item for all users")
           try {
               const sess = await mongoose.startSession();
               sess.startTransaction();
               await item.remove({session: sess});
               //removing item from old category
               oldCategory.toDoList = oldCategory.toDoList.filter(item => item._id.toString()!==tid)
               await user.save({session: sess});
               await sess.commitTransaction();
             } catch (err) {
                return({error:error, errorMessage:"Something went wrong, could not delete item", errorCode:500})
             }
       }
       else{
           try {
               //removing item from old category
               oldCategory.toDoList = oldCategory.toDoList.filter(item => item._id.toString()!==tid)
               await user.save();
             } catch (err) {
                return({error:error, errorMessage:"Something went wrong, could not delete item", errorCode:"500"})
             }
            }
        return({error:false})
}



//-----------------------Controllers------------------
const createItem = async(req,res,next)=>{ //dont need to check for duplicates because they are ok
    const{cid, uid, name, recurring, status,due,priority,address,location,notes}= req.body;//creator and users[0]= uid

    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    let category = user.toDoCategories.filter(category => category.name === cid)[0]
    if (!category)
    {
        return(next(new HttpError("Category not found", 422)))
    }
    
    //Create Item
    const newItem = new ToDoItem({
        name,
        recurring,
        status,
        due,
        priority,
        address,
        location,
        notes,
        creator:uid,
        users:[uid]
    });

    
    //Save user and todo with sessions like in new place
    try{
        
        const sess = await mongoose.startSession();
        sess.startTransaction();//transactions perform multiple action
        
        await newItem.save({session:sess})
        category.toDoList.push(newItem);
        user.toDoCategories.filter(category => category.name === cid)

        //user.toDoCategories.filter(category => category.name === cid)[toDoList].push(newItem);
        await user.save({session:sess});
        

        await sess.commitTransaction();//saves transaction if all successful 
    }
    catch(error){
        console.log(error)
        return(next(new HttpError('Could not update user or item in database', 500)));
    }
        

    res.status(201).json({task: newItem.toObject({getters:true})})
}

const editItem = async(req,res,next)=>{
            const tid = req.params.TDIID;
            const {name,status,priority,address,notes}= req.body;
    
            let item = await getItemById(tid);
            if(!!item.error){return(next(new HttpError(item.errorMessage, item.errorCode)))}
    
            if(name){item.name = name};
            if(status){item.status = status};
            if(status){item.priority = priority};
            if(status){item.address = address};//update location at the same time
            if(status){item.notes = notes};

            
            try{
                await item.save();
            }
            catch(error){
                console.log(error);
                return(next(new HttpError('Could not update task in database', 500)));
            }
                
        
                
            res.status(200).json({preferences: item.toObject({getters:true})});
}

const deleteItem = async(req,res,next)=>{//make sure to delete entire if user is creator, otherwise just remove them from user list and item from category
    const deletingItem = await deleteItemHelper(req);
    if(!!deletingItem.error){return(next(new HttpError(deletingItem.errorMessage, deletingItem.errorCode)))}
    res.status(201).json({message:"deleted"})
}

const getItem = async(req,res,next)=>{
    const tid = req.params.TDIID;
    //getting item from DB
    let item = await getItemById(tid);
    if(!!item.error){return(next(new HttpError(item.errorMessage, item.errorCode)))}
 

    res.status(200).json({task: item.toObject({getters:true})});

}

const getItems= async(req,res,next)=>{ //all items from category
    const {cid,uid} = req.params;
    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    let category = user.toDoCategories.filter(category => category.name === cid)[0]
    if (category.length===0)
    {
        return(next(new HttpError("Category Cant Be Located", 422)))
    }

    var itemArray = await Promise.all(category.toDoList.map(async(item) => { //waits until all promises finish
        var newItem = (await getItemById(item._id.toString()));
        if(!!newItem.error){return(next(new HttpError(newItem.errorMessage, newItem.errorCode)))}
        console.log(newItem);
        return(newItem);
    } ))
    res.status(200).json({items: itemArray})
}

const moveItem = async(req,res,next)=>{ 

    const{tid, uid, cid, oldCid}= req.body;
    //get user
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}

    //make sure the cid and oldCid are different
    if(cid === oldCid){
        return(next(new HttpError("Task is already in that category", 409)))
    }

    //find item by Users(makes sure the user has category before running through long process of searching every category)
    //get category
    let oldCategory
    if (oldCid===undefined)
    {
        //find category from searching
        
        oldCategory = user.toDoCategories.filter(category => 
           category.toDoList.filter(item => 
                item._id.toString()===tid
            ).length!==0
        )[0]
    }
    else{ //alot more efficient than way above
        oldCategory = user.toDoCategories.filter(category => category.name === oldCid)
    }
    if (!oldCategory){return(next(new HttpError("Task/Category Cant Be Located", 422)))};
    
    //removing item from old category
    oldCategory.toDoList = oldCategory.toDoList.filter(item => item._id.toString()!==tid)
    
    //get item 
    let itemExists = await itemInDataBase(tid)
    if(!!itemExists.error){return(next(new HttpError(itemExists.errorMessage, itemExists.errorCode)))}
    if(!itemExists){return(next(new HttpError("to do item not located in db", 404)))}

    //get new category
    category = user.toDoCategories.filter(category => category.name === cid)[0]
    if (!category){return(next(new HttpError("Category Cant Be Located", 422)))};
    
    //add to item to new category
    category.toDoList.push(tid);    

    //save user
    try{
        await user.save();
    }
    catch(error){
        return(next(new HttpError('Could not update user in database', 500)));
    }


    res.status(201).json({category: category.toObject({getters:true})})
}
const shareItem = async(req,res,next)=>{//max size of user inbox == 20
    const{tid, uid}= req.body;
    //get user
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}

    //check item 
    let itemExists = await itemInDataBase(tid)
    if(!!itemExists.error){return(next(new HttpError(itemExists.errorMessage, itemExists.errorCode)))}
    if(!itemExists){return(next(new HttpError("to do item not located in db", 404)))}

    //get new category
    category = user.pendingSharedTasks;
    if (!category){return(next(new HttpError("Category Cant Be Located", 422)))};
    if(category.length>=20)
    {
        return(next(new HttpError("Sorry users inbox is currently full", 552)))
    }
    //add to item to new category
    category.toDoList.push(tid);    

    //save user
    try{
        await user.save();
    }
    catch(error){
        return(next(new HttpError('Could not update user in database', 500)));
    }


    res.status(201).json({category: category.toObject({getters:true})})
}
const acceptPendingSharedItem = async(req,res,next)=>{ 
    const{tid, uid, cid}= req.body;
    //get user
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}

    
    //get category
    let oldCategory = user.pendingSharedTasks;
    if (!oldCategory){return(next(new HttpError("Task/Category Cant Be Located", 422)))};
    
    //removing item from old category
    oldCategory = oldCategory.filter(item => item._id.toString()!==tid)
    
    //check item 
    let itemExists = await itemInDataBase(tid)
    if(!!itemExists.error){return(next(new HttpError(itemExists.errorMessage, itemExists.errorCode)))}
    if(!itemExists){return(next(new HttpError("to do item not located in db", 404)))}

    //get new category
    category = user.toDoCategories.filter(category => category.name === cid)[0]
    if (!category){return(next(new HttpError("Category Cant Be Located", 422)))};
    
    //add to item to new category
    category.toDoList.push(tid);    

    //save user
    try{
        await user.save();
    }
    catch(error){
        return(next(new HttpError('Could not update user in database', 500)));
    }


    res.status(201).json({category: category.toObject({getters:true})})
}
const getPendingSharedItems = async(req,res,next)=>{
    const {uid} = req.params;
    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    
    
    res.status(200).json({items: user.pendingSharedTasks})
}
const transferCreator = async(req,res,next)=>{//same as move item except with user not item.
    const{uidOldCreator, uidCreator, tid}= req.body;

    //make sure its not the same creator
    if(uidOldCreator=== uidCreator){ return(next(new HttpError("You are already the owner", 409)))}

    //get task
    let item = await getItemById(tid);
    if(!!item.error){return(next(new HttpError(item.errorMessage, item.errorCode)))}

    //make sure user owns item
    if(uidOldCreator!==item.creator._id.toString()){ return(next(new HttpError("Sorry you are not the creator of this task", 409)))}

    //Make sure users exist
    let creator = await userController.userInDataBase(uidOldCreator)
    if(!!creator.error){return(next(new HttpError(creator.errorMessage, creator.errorCode)))}
    if(!creator){return(next(new HttpError("oldCreator not located in db", 404)))}

    creator = await userController.userInDataBase(uidCreator)
    if(!!creator.error){return(next(new HttpError(creator.errorMessage, creator.errorCode)))}
    if(!creator){return(next(new HttpError("creator(new) not located in db", 404)))}

    
    item.creator = uidCreator
    console.log(item);
        //save task
       // try{
         //   await item.save();
       // }
        //catch(error){
         //   return(next(new HttpError('Could not update user in database', 500)));
        //}

    res.status(201).json({item:item.toObject({getters:true})})
}
const createCategory = async(req,res,next)=>{
    const{uid, name, icon}= req.body;

    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
  
    if (user.toDoCategories.filter(category => category.name === name).length!==0)
    {
        return(next(new HttpError("Category name already exists", 422)))
    }
    
    const category = {
        name,
        icon,
        toDoList:[]
    }
    user.toDoCategories.push(category);

    try{
        await user.save();
    }
    catch(error){
        console.log(error);
        return(next(new HttpError('Could not update user in database', 500)));
    }
        

    res.status(201).json({category: user.toDoCategories.toObject({getters:true})})
}

const renameCategory = async(req,res,next)=>{
    const{uid, name , newName}= req.body;

    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
   
    if (user.toDoCategories.filter(category => category.name === name).length!==0)
    {
        user.toDoCategories.find(category => category.name === name).name = newName;
    }
    else{
        return(next(new HttpError("Category not found in database", 404)))
    }
    

    try{
        await user.save();
    }
    catch(error){
        console.log(error);
        return(next(new HttpError('Could not update user in database', 500)));
    }
        

    res.status(201).json({category: user.toDoCategories.toObject({getters:true})})
}
const deleteCategory = async(req,res,next)=>{ 
    // const {cid,uid} = req.body;
    // if(uid===undefined){return(next(new HttpError("Please provide uid", 400 )))}
    // if(cid===undefined){return(next(new HttpError("Please provide cid", 400 )))}
    // //Find User
    // let user = await getUserById(uid); 
    // if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    // let category = user.toDoCategories.filter(category => category.name === cid)[0]
    // if (category.length===0)
    // {return(next(new HttpError("Category Cant Be Located", 404)))}
    // console.log(category)
    // try{
    //     await category.toDoList.map(async(item) => {
    //         const itemToRemove={body:{uid:uid,tid:item._id.toString(), oldCid:category.name}}
    //         console.log(itemToRemove);
    //         const deletingItem = await deleteItemHelper(itemToRemove);
    //         if(!!deletingItem.error){return(next(new HttpError(deletingItem.errorMessage, deletingItem.errorCode)))}
    //     })
    // }catch(error){
    //     console.log(error);
    //     {return(next(new HttpError("Could not delete Items from array", 500)))}
    // }

    //delete all items in category array

    //remove category from user

    
    res.status(201).json({message:`deleted ${cid}`})
}
const getCategory = async(req,res,next)=>{
    const {cid,uid} = req.params;
    if(uid===undefined){return(next(new HttpError("Please provide uid", 400 )))}
    if(cid===undefined){return(next(new HttpError("Please provide cid", 400 )))}
    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    let category = user.toDoCategories.filter(category => category.name === cid)
    if (category.length===0)
    {
        return(next(new HttpError("Category Cant Be Located", 404)))
    }
    res.status(200).json({category: category})
}

const getCategories = async (req,res,next)=>{
    const {uid} = req.params;
    if(uid===undefined){return(next(new HttpError("Please provide uid", 400 )))}
    //Find User
    let user = await getUserById(uid); 
    if(!!user.error){return(next(new HttpError(user.errorMessage, user.errorCode)))}
    let categories = user.toDoCategories
    if (categories.length===0)
    {
        return(next(new HttpError("Category empty", 404)))
    }
    res.status(200).json({categories: categories})
}


//---------------------Exports--------------------------
exports.createItem = createItem;//yes I realize this could be called task but im commited now
exports.editItem = editItem;
exports.deleteItem = deleteItem;
exports.getItem = getItem;
exports.getItems = getItems;

exports.moveItem = moveItem;

exports.shareItem = shareItem;
exports.acceptPendingSharedItem = acceptPendingSharedItem;
exports.getPendingSharedItems =getPendingSharedItems;
exports.transferCreator = transferCreator;

exports.createCategory = createCategory;
exports.renameCategory = renameCategory;
exports.deleteCategory = deleteCategory;
exports.getCategory = getCategory;
exports.getCategories = getCategories;
